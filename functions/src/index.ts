import {onCall, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import Redis from "ioredis";
import * as logger from "firebase-functions/logger";
import {defineSecret} from "firebase-functions/params";

// Define the secret in one place
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
  return new Redis(connectionUrl, {
    lazyConnect: true,
  });
}

const functionOptions = {
  secrets: [redisUrlSecret], // Tell all functions to use this secret
};

/**
 * Retrieves the current leaderboard.
 */
export const getLeaderboard = onCall(functionOptions, async () => {
  let redisClient: Redis | undefined;
  try {
    redisClient = getRedisClient();
    logger.log("Fetching leaderboard...");

    const leaderboardData = await redisClient.zrevrange(
      "daily_high_scores", 0, 9, "WITHSCORES"
    );
    return {leaderboard: leaderboardData};
  } catch (error) {
    logger.error("Error in getLeaderboard:", error);
    throw new HttpsError(
      "internal",
      "An error occurred while fetching the leaderboard."
    );
  } finally {
    if (redisClient) {
      redisClient.quit();
    }
  }
});

/**
 * Submits a new score to the leaderboard.
 */
export const submitScore = onCall(functionOptions, async (request) => {
  const {playerName, score} = request.data;

  if (!playerName || typeof score !== "number") {
    throw new HttpsError(
      "invalid-argument",
      "Player name and score are required."
    );
  }

  let redisClient: Redis | undefined;
  try {
    redisClient = getRedisClient();
    logger.log("Submitting score...");

    await redisClient.zadd("daily_high_scores", score, playerName);

    const message = `Score for ${playerName} submitted.`;
    return {status: "success", message: message};
  } catch (error) {
    logger.error("Error in submitScore:", error);
    throw new HttpsError(
      "internal",
      "An error occurred while submitting the score."
    );
  } finally {
    if (redisClient) {
      redisClient.quit();
    }
  }
});

/**
 * Runs on a schedule to reset the daily leaderboard.
 */
export const resetDailyLeaderboards = onSchedule(
  {schedule: "every day 00:00", ...functionOptions},
  async () => {
    let redisClient: Redis | undefined;
    try {
      redisClient = getRedisClient();
      logger.log("Resetting daily leaderboard...");

      await redisClient.del("daily_high_scores");

      logger.log("Daily leaderboard has been reset successfully.");
    } catch (error) {
      logger.error("Error resetting daily leaderboard:", error);
    } finally {
      if (redisClient) {
        redisClient.quit();
      }
    }
  },
);
