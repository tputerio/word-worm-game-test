import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import Redis from "ioredis";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";

const redisUrlSecret = defineSecret("UPSTASH_REDIS_CONNECTION_URL");

admin.initializeApp();

/**
 * Creates a new Redis client instance using the configured secret.
 * @return {Redis} A new ioredis client.
 */
function getRedisClient(): Redis {
  const connectionUrl = redisUrlSecret.value();
  if (!connectionUrl) {
    logger.error("FATAL: Redis connection URL is not available.");
    throw new HttpsError("internal", "Database configuration is missing.");
  }
  return new Redis(connectionUrl, {lazyConnect: true});
}

const functionOptions = {secrets: [redisUrlSecret]}; // Removed minInstances: 1

export const getLeaderboard = onCall(functionOptions, async () => {
  let redisClient: Redis | undefined;
  try {
    redisClient = getRedisClient();
    await redisClient.connect();
    logger.log("Fetching leaderboards...");

    // Use Redis pipelining to batch all zrevrange calls
    const pipelineResults = await redisClient.pipeline([
      ["zrevrange", "daily_high_scores", 0, 9, "WITHSCORES"],
      ["zrevrange", "daily_total_points", 0, 9, "WITHSCORES"],
      ["zrevrange", "daily_best_word", 0, 9, "WITHSCORES"],
      ["zrevrange", "all_time_high_scores", 0, 9, "WITHSCORES"],
      ["zrevrange", "all_time_total_points", 0, 9, "WITHSCORES"],
      ["zrevrange", "all_time_best_word", 0, 9, "WITHSCORES"],
    ]).exec();

    // Handle null pipeline results
    if (!pipelineResults) {
      logger.error("Redis pipeline returned null");
      throw new HttpsError("internal",
        "Failed to fetch leaderboards: pipeline returned null");
    }

    // Extract results, ensuring each result is typed correctly
    const [
      dailyHighScores,
      dailyTotalPoints,
      dailyBestWord,
      allTimeHighScores,
      allTimeTotalPoints,
      allTimeBestWord,
    ] = pipelineResults.map((result) => {
      if (result[0]) throw result[0]; // Throw any pipeline command error
      return result[1] as string[];
    });

    const formatLeaderboard = (data: string[], isBestWord = false) => {
      const formatted = [];
      for (let i = 0; i < data.length; i += 2) {
        const [key, score] = [data[i], data[i + 1]];
        if (isBestWord) {
          const [word] = key.split(":").slice(0, -1);
          formatted.push(word, score);
        } else {
          const [playerName] = key.split(":");
          formatted.push(playerName, score);
        }
      }
      return formatted;
    };

    return {
      daily: {
        highScores: formatLeaderboard(dailyHighScores),
        totalPoints: formatLeaderboard(dailyTotalPoints),
        bestWord: formatLeaderboard(dailyBestWord, true),
      },
      allTime: {
        highScores: formatLeaderboard(allTimeHighScores),
        totalPoints: formatLeaderboard(allTimeTotalPoints),
        bestWord: formatLeaderboard(allTimeBestWord, true),
      },
    };
  } catch (error) {
    logger.error("Error in getLeaderboard:", error);
    throw new HttpsError("internal", "Error fetching leaderboards.");
  } finally {
    if (redisClient) {
      await redisClient.quit();
    }
  }
});

export const submitScore = onCall(functionOptions, async (request) => {
  const {
    playerName,
    userId,
    highScore,
    totalPoints,
    bestWordScore,
    bestWord,
  } = request.data;

  if (
    !playerName ||
    !userId ||
    typeof highScore !== "number" ||
    typeof totalPoints !== "number" ||
    typeof bestWordScore !== "number" ||
    !bestWord
  ) {
    throw new HttpsError(
      "invalid-argument",
      "Missing or invalid required fields."
    );
  }

  let redisClient: Redis | undefined;
  try {
    redisClient = getRedisClient();
    await redisClient.connect();
    logger.log(`Submitting scores for ${playerName}...`);
    const member = `${playerName}:${userId}`;
    const bestWordMember = `${bestWord}:${userId}`;
    await redisClient.pipeline([
      ["zadd", "daily_high_scores", highScore, member],
      ["zadd", "daily_total_points", totalPoints, member],
      ["zadd", "daily_best_word", bestWordScore, bestWordMember, "XX"],
      ["zadd", "all_time_high_scores", highScore, member],
      ["zadd", "all_time_total_points", totalPoints, member],
      ["zadd", "all_time_best_word", bestWordScore, bestWordMember, "XX"],
    ]).exec();

    return {status: "success", message: `Scores for ${playerName} submitted.`};
  } catch (error) {
    logger.error("Error in submitScore:", error);
    throw new HttpsError(
      "internal",
      "Error submitting scores to leaderboards."
    );
  } finally {
    if (redisClient) {
      await redisClient.quit();
    }
  }
});

export const resetDailyLeaderboards = onSchedule(
  {schedule: "every day 00:00", ...functionOptions},
  async () => {
    let redisClient: Redis | undefined;
    try {
      redisClient = getRedisClient();
      await redisClient.connect();
      logger.log("Resetting daily leaderboards...");
      await redisClient.pipeline([
        ["del", "daily_high_scores"],
        ["del", "daily_total_points"],
        ["del", "daily_best_word"],
      ]).exec();
      logger.log("Daily leaderboards reset successfully.");
    } catch (error) {
      logger.error("Error resetting daily leaderboards:", error);
    } finally {
      if (redisClient) {
        await redisClient.quit();
      }
    }
  }
);
