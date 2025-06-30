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

const functionOptions = {secrets: [redisUrlSecret]};

export const getLeaderboard = onCall(functionOptions, async () => {
  let redisClient: Redis | undefined;
  try {
    redisClient = getRedisClient();
    logger.log("Fetching leaderboards...");
    const dailyHighScores = await redisClient.zrevrange(
      "daily_high_scores",
      0,
      9,
      "WITHSCORES"
    );
    const dailyTotalPoints = await redisClient.zrevrange(
      "daily_total_points",
      0,
      9,
      "WITHSCORES"
    );
    const dailyBestWord = await redisClient.zrevrange(
      "daily_best_word",
      0,
      9,
      "WITHSCORES"
    );
    const allTimeHighScores = await redisClient.zrevrange(
      "all_time_high_scores",
      0,
      9,
      "WITHSCORES"
    );
    const allTimeTotalPoints = await redisClient.zrevrange(
      "all_time_total_points",
      0,
      9,
      "WITHSCORES"
    );
    const allTimeBestWord = await redisClient.zrevrange(
      "all_time_best_word",
      0,
      9,
      "WITHSCORES"
    );

    const formatLeaderboard = (data: string[]) => {
      const formatted = [];
      for (let i = 0; i < data.length; i += 2) {
        const [playerName] = data[i].split(":");
        formatted.push(playerName, data[i + 1]);
      }
      return formatted;
    };

    return {
      daily: {
        highScores: formatLeaderboard(dailyHighScores),
        totalPoints: formatLeaderboard(dailyTotalPoints),
        bestWord: formatLeaderboard(dailyBestWord),
      },
      allTime: {
        highScores: formatLeaderboard(allTimeHighScores),
        totalPoints: formatLeaderboard(allTimeTotalPoints),
        bestWord: formatLeaderboard(allTimeBestWord),
      },
    };
  } catch (error) {
    logger.error("Error in getLeaderboard:", error);
    throw new HttpsError("internal", "Error fetching leaderboards.");
  } finally {
    if (redisClient) {
      redisClient.quit();
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
    logger.log(`Submitting scores for ${playerName}...`);
    const member = `${playerName}:${userId}`;
    const bestWordMember = `${member}:${bestWord}`;
    await Promise.all([
      redisClient.zadd("daily_high_scores", highScore, member),
      redisClient.zadd("daily_total_points", totalPoints, member),
      redisClient.zadd("daily_best_word", bestWordScore, bestWordMember),
      redisClient.zadd("all_time_high_scores", highScore, member),
      redisClient.zadd("all_time_total_points", totalPoints, member),
      redisClient.zadd("all_time_best_word", bestWordScore, bestWordMember),
    ]);

    return {status: "success", message: `Scores for ${playerName} submitted.`};
  } catch (error) {
    logger.error("Error in submitScore:", error);
    throw new HttpsError(
      "internal",
      "Error submitting scores to leaderboards."
    );
  } finally {
    if (redisClient) {
      redisClient.quit();
    }
  }
});

export const resetDailyLeaderboards = onSchedule(
  {schedule: "every day 00:00", ...functionOptions},
  async () => {
    let redisClient: Redis | undefined;
    try {
      redisClient = getRedisClient();
      logger.log("Resetting daily leaderboards...");
      await Promise.all([
        redisClient.del("daily_high_scores"),
        redisClient.del("daily_total_points"),
        redisClient.del("daily_best_word"),
      ]);
      logger.log("Daily leaderboards reset successfully.");
    } catch (error) {
      logger.error("Error resetting daily leaderboards:", error);
    } finally {
      if (redisClient) {
        redisClient.quit();
      }
    }
  }
);
