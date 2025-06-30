//
// FILE: functions/src/index.ts (Corrected for v2 SDK)
//
import { onCall, HttpsError } from "firebase-functions/v2/https";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import * as admin from "firebase-admin";
import Redis from "ioredis";
import * as logger from "firebase-functions/logger";

admin.initializeApp();
const db = admin.firestore();

// Set secrets required by functions. This is the v2 way.
const a = { secrets: ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN"], };

// Initialize the Redis client. This part remains the same.
const redisClient = new Redis(process.env.UPSTASH_REDIS_REST_URL!, {
  password: process.env.UPSTASH_REDIS_REST_TOKEN!,
  lazyConnect: true,
});

export const submitScore = onCall(a, async (request) => {
  // 1. Validate the call
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError("unauthenticated", "You must be logged in.");
  }
  const userId = request.auth.uid;
  const finalScore = Number(request.data.finalScore) || 0;
  
  // Define the type for a word object
  type Word = { word: string, score: number };
  const words: Word[] = Array.isArray(request.data.words) ? request.data.words : [];

  // 2. Fetch player's name safely on the backend
  let playerName = "Anonymous";
  try {
    const userRecord = await admin.auth().getUser(userId);
    playerName = userRecord.displayName || 'Anonymous';
  } catch (error) {
    logger.error(`Could not fetch user data for ${userId}`, error);
  }
  const member = `${userId}:${playerName}`;

  // 3. Define all database and Redis operations
  // By defining the Word type, TypeScript now understands max and word.
  const bestWord = words.reduce((max: Word, word: Word) => word.score > max.score ? word : max, { word: '', score: 0 });

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
    }, { merge: true }),
    redisClient.zadd(`daily_high_scores`, finalScore, member),
    redisClient.zincrby(`daily_total_points`, finalScore, member),
    bestWord.score > 0 ? redisClient.zadd(`daily_best_word`, "GT", bestWord.score, member) : Promise.resolve(),
    redisClient.zadd(`alltime_high_scores`, "GT", finalScore, member),
    redisClient.zincrby(`alltime_total_points`, finalScore, member),
    bestWord.score > 0 ? redisClient.zadd(`alltime_best_word`, "GT", bestWord.score, member) : Promise.resolve(),
  ];

  // 4. Execute all operations in parallel
  await Promise.all(promises);

  // 5. Get the player's rank from Redis
  const rank = await redisClient.zrevrank(`daily_high_scores`, member);

  // 6. Return the rank to the client
  return { rank: rank !== null ? rank + 1 : null };
});

/**
 * An HTTP-triggered function to fetch the top 10s for all leaderboards.
 */
export const getLeaderboard = onRequest({ cors: true }, async (req, res) => {
  const formatLeaderboard = (data: string[]) => {
    const result = [];
    for (let i = 0; i < data.length; i += 2) {
      const [member, score] = [data[i], data[i+1]];
      const [userId, ...nameParts] = member.split(':');
      result.push({ userId, name: nameParts.join(':') || 'Anonymous', score: Number(score) });
    }
    return result;
  };

  const [
    dailyHighScores, dailyTotalPoints, dailyBestWord,
    alltimeHighScores, alltimeTotalPoints, alltimeBestWord
  ] = await Promise.all([
    redisClient.zrevrange("daily_high_scores", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("daily_total_points", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("daily_best_word", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_high_scores", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_total_points", 0, 9, "WITHSCORES"),
    redisClient.zrevrange("alltime_best_word", 0, 9, "WITHSCORES"),
  ]);

  res.json({
    daily: { highScore: formatLeaderboard(dailyHighScores), totalPoints: formatLeaderboard(dailyTotalPoints), bestWord: formatLeaderboard(dailyBestWord) },
    allTime: { highScore: formatLeaderboard(alltimeHighScores), totalPoints: formatLeaderboard(alltimeTotalPoints), bestWord: formatLeaderboard(alltimeBestWord) }
  });
});

/**
 * A scheduled function that runs every day at midnight.
 */
export const resetDailyLeaderboards = onSchedule("0 0 * * *", async () => {
  try {
    const dailyKeys = ["daily_high_scores", "daily_total_points", "daily_best_word"];
    await redisClient.del(dailyKeys);
    logger.log("Daily leaderboards have been successfully reset.");
  } catch (error) {
    logger.error("Error resetting daily leaderboards:", error);
  }
});