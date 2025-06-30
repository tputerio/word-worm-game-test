import {onCall, onRequest, HttpsError} from "firebase-functions/v2/https";
import {onSchedule} from "firebase-functions/v2/scheduler";
import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import Redis from "ioredis";
import * as logger from "firebase-functions/logger";

admin.initializeApp();
const db = admin.firestore();

// --- Read from functions.config() instead of process.env ---
const redisUrl = functions.config().upstash.url;
const redisToken = functions.config().upstash.token;

if (!redisUrl || !redisToken) {
  logger.error("FATAL: Redis configuration not found in functions.config()");
}
const redisClient = new Redis(redisUrl, {
  password: redisToken,
  lazyConnect: true,
});

/**
 * A callable function that a user calls from the game after finishing.
 */
export const submitScore = onCall(async (request) => {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const userId = request.auth.uid;
  const finalScore = Number(request.data.finalScore) || 0;

  type Word = { word: string, score: number };
  const words: Word[] = Array.isArray(request.data.words) ?
    request.data.words : [];

  let playerName = "Anonymous";
  try {
    const userRecord = await admin.auth().getUser(userId);
    playerName = userRecord.displayName || "Anonymous";
  } catch (error) {
    logger.error(`Could not fetch user data for ${userId}`, error);
  }
  const member = `${userId}:${playerName}`;

  const bestWord = words.reduce(
    (max: Word, word: Word) => (word.score > max.score ? word : max),
    {word: "", score: 0},
  );

  const promises = [
    db.collection("games").add({
      userId,
      score: finalScore,
      words,
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    }),
    db.doc(`players/${userId}`).set({
      totalGamesPlayed: admin.firestore.FieldValue.increment(1),
      totalPoints: admin.firestore.FieldValue.increment(finalScore),
    }, {merge: true}),
    redisClient.zadd("daily_high_scores", finalScore, member),
    redisClient.zincrby("daily_total_points", finalScore, member),
    bestWord.score > 0 ?
      redisClient.zadd("daily_best_word", "GT", bestWord.score, member) :
      Promise.resolve(),
    redisClient.zadd("alltime_high_scores", "GT", finalScore, member),
    redisClient.zincrby("alltime_total_points", finalScore, member),
    bestWord.score > 0 ?
      redisClient.zadd("alltime_best_word", "GT", bestWord.score, member) :
      Promise.resolve(),
  ];

  await Promise.all(promises);
  const rank = await redisClient.zrevrank("daily_high_scores", member);
  return {rank: rank !== null ? rank + 1 : null};
});

/**
 * An HTTP-triggered function to fetch the top 10s for all leaderboards.
 */
export const getLeaderboard = onRequest({cors: true}, async (req, res) => {
  const formatLeaderboard = (data: string[]) => {
    const result: {
      userId: string,
      name: string,
      score: number
    }[] = [];
    for (let i = 0; i < data.length; i += 2) {
      const [member, score] = [data[i], data[i+1]];
      const [userId, ...nameParts] = member.split(":");
      result.push({
        userId,
        name: nameParts.join(":") || "Anonymous",
        score: Number(score),
      });
    }
    return result;
  };

  const [
    dailyHighScores, dailyTotalPoints, dailyBestWord,
    alltimeHighScores, alltimeTotalPoints, alltimeBestWord,
  ] = await Promise.all([
    redisClient.zrevrange("daily_high_scores", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("daily_total_points", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("daily_best_word", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_high_scores", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_total_points", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_best_word", 0, 9, "WITHSCORES"),
  ]);

  res.json({
    daily: {
      highScore: formatLeaderboard(dailyHighScores),
      totalPoints: formatLeaderboard(dailyTotalPoints),
      bestWord: formatLeaderboard(dailyBestWord),
    },
    allTime: {
      highScore: formatLeaderboard(alltimeHighScores),
      totalPoints: formatLeaderboard(alltimeTotalPoints),
      bestWord: formatLeaderboard(alltimeBestWord),
    },
  });
});

/**
 * A scheduled function that runs every day at midnight.
 */
export const resetDailyLeaderboards = onSchedule("0 0 * * *", async () => {
  try {
    const dailyKeys = [
      "daily_high_scores",
      "daily_total_points",
      "daily_best_word",
    ];
    await redisClient.del(dailyKeys);
    logger.log("Daily leaderboards have been successfully reset.");
  } catch (error) {
    logger.error("Error resetting daily leaderboards:", error);
  }
});
