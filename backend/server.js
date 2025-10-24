import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import csv from "csv-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = 3001;

// Enable CORS for frontend
app.use(cors({
  origin: "http://localhost:3000",
  methods: ["GET", "POST"],
  credentials: true
}));

app.use(express.json());
app.use(express.static(path.join(__dirname, "../frontend")));

/* -------------------------
   Music Database - Load from CSV
------------------------- */
let musicDatabase = [];
let isCSVLoaded = false;

// Function to generate YouTube search URL
function generateYouTubeSearchUrl(songTitle, artist) {
  const searchQuery = encodeURIComponent(`${songTitle} ${artist} official music video`);
  return `https://www.youtube.com/results?search_query=${searchQuery}`;
}

// Helper function to generate fake Spotify ID if not available
function generateSpotifyId() {
  return Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
}

// Function to load CSV data
function loadCSVData() {
  return new Promise((resolve, reject) => {
    const csvFilePath = path.join(__dirname, 'muse_v3.csv');
    
    if (!fs.existsSync(csvFilePath)) {
      console.error('❌ CSV file not found at:', csvFilePath);
      reject(new Error('CSV file not found. Please make sure muse_v3.csv is in the backend folder.'));
      return;
    }

    console.log('📥 Loading music dataset from CSV...');
    
    let loadedCount = 0;
    const batchSize = 10000;
    
    fs.createReadStream(csvFilePath)
      .pipe(csv())
      .on('data', (row) => {
        try {
          // Parse the seeds column which contains mood information
          let seeds = [];
          try {
            // Clean and parse the seeds column
            const seedsStr = row.seeds || '[]';
            seeds = JSON.parse(seedsStr.replace(/'/g, '"'));
          } catch (e) {
            // If JSON parsing fails, try to extract from string
            const seedsMatch = row.seeds?.match(/\[(.*?)\]/);
            if (seedsMatch && seedsMatch[1]) {
              seeds = seedsMatch[1].split(',').map(s => s.trim().replace(/'/g, '').replace(/"/g, ''));
            }
          }

          // Extract Spotify ID from spotify_id column or from lastfm_url
          let spotifyId = row.spotify_id;
          if (!spotifyId && row.lastfm_url) {
            const spotifyMatch = row.lastfm_url.match(/tracks\/([a-zA-Z0-9]+)/);
            if (spotifyMatch) {
              spotifyId = spotifyMatch[1];
            }
          }

          // Map CSV columns to your expected format
          const song = {
            title: row.track || 'Unknown Title',
            artist: row.artist || 'Unknown Artist',
            mood: mapSeedsToMood(seeds, row),
            language: detectLanguage(row),
            spotifyId: spotifyId || generateSpotifyId(),
            youtubeUrl: generateYouTubeSearchUrl(row.track, row.artist),
            tags: generateTagsFromSeeds(seeds),
            genre: row.genre || 'Unknown',
            // Include audio features from the CSV
            features: {
              valence: parseFloat(row.valence_tags) || 0.5,
              energy: parseFloat(row.arousal_tags) || 0.5,
              danceability: 0.5,
              acousticness: 0.5,
              tempo: 120,
              loudness: -6
            }
          };
          
          // Only add if we have basic info
          if (song.title && song.artist && song.title !== 'Unknown Title' && song.artist !== 'Unknown Artist') {
            musicDatabase.push(song);
            loadedCount++;
            
            // Log progress for large files
            if (loadedCount % batchSize === 0) {
              console.log(`📊 Loaded ${loadedCount} songs...`);
            }
          }
        } catch (error) {
          console.warn('Skipping invalid row:', error.message);
        }
      })
      .on('end', () => {
        console.log(`✅ Successfully loaded ${musicDatabase.length} songs from CSV`);
        isCSVLoaded = true;
        
        // Log language distribution for debugging
        const languageCounts = {};
        musicDatabase.forEach(song => {
          languageCounts[song.language] = (languageCounts[song.language] || 0) + 1;
        });
        console.log('🌍 Language distribution:', languageCounts);
        
        // Log mood distribution
        const moodCounts = {};
        musicDatabase.forEach(song => {
          moodCounts[song.mood] = (moodCounts[song.mood] || 0) + 1;
        });
        console.log('🎭 Mood distribution:', moodCounts);
        
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ Error loading CSV:', error);
        reject(error);
      });
  });
}

// Function to map seeds to mood
function mapSeedsToMood(seeds, row) {
  // Convert seeds to lowercase for easier matching
  const seedWords = seeds.map(seed => seed.toLowerCase());
  
  // Map seeds to moods
  if (seedWords.includes('happy') || seedWords.includes('fun') || seedWords.includes('joyful')) {
    return "happy";
  }
  if (seedWords.includes('sad') || seedWords.includes('melancholy') || seedWords.includes('emotional')) {
    return "sad";
  }
  if (seedWords.includes('energetic') || seedWords.includes('aggressive') || seedWords.includes('intense')) {
    return "energetic";
  }
  if (seedWords.includes('relaxed') || seedWords.includes('calm') || seedWords.includes('chill')) {
    return "relaxed";
  }
  if (seedWords.includes('romantic') || seedWords.includes('sexy') || seedWords.includes('love')) {
    return "romantic";
  }
  if (seedWords.includes('angry') || seedWords.includes('aggressive')) {
    return "angry";
  }

  // Fallback to valence-based mood detection
  const valence = parseFloat(row.valence_tags) || 0.5;
  const arousal = parseFloat(row.arousal_tags) || 0.5;
  
  if (valence > 6 && arousal > 5) return "happy";
  if (valence < 4 && arousal < 5) return "sad";
  if (arousal > 5.5) return "energetic";
  if (arousal < 4.5) return "relaxed";
  if (valence > 5 && valence < 6) return "romantic";
  
  return "energetic"; // Default based on common seeds
}

// Function to generate tags from seeds
function generateTagsFromSeeds(seeds) {
  const tags = [...seeds];
  
  // Add some additional tags based on common patterns
  if (seeds.includes('aggressive')) tags.push('intense', 'powerful');
  if (seeds.includes('fun')) tags.push('upbeat', 'joyful');
  if (seeds.includes('energetic')) tags.push('high-energy', 'dynamic');
  if (seeds.includes('sexy')) tags.push('sensual', 'romantic');
  
  return tags.slice(0, 5); // Limit to 5 tags
}

// Enhanced language detection function
function detectLanguage(row) {
  const title = (row.track || '').toLowerCase();
  const artist = (row.artist || '').toLowerCase();
  const genre = (row.genre || '').toLowerCase();

  // Check for Indian languages and artists
  if (artist.includes('aastha') || artist.includes('raftaar') || artist.includes('vishal') || 
      title.match(/(saara|india|khuda|haafiz|sainika)/i)) {
    return "Hindi";
  }

  // Check for specific language patterns
  const languagePatterns = [
    { lang: "Korean", pattern: /[가-힣]/ },
    { lang: "Japanese", pattern: /[一-龯]|[ぁ-ん]|[ァ-ン]/ },
    { lang: "Russian", pattern: /[а-я]/i },
    { lang: "Arabic", pattern: /[أ-ي]/ },
    { lang: "Hindi", pattern: /[ह-ॿ]/ },
    { lang: "Chinese", pattern: /[一-龯]|[⺀-⺙]|[⺛-⻳]/ },
    { lang: "Turkish", pattern: /[çğıöşü]/i },
    { lang: "French", pattern: /[àâäçéèêëîïôöùûüÿ]/i },
    { lang: "Spanish", pattern: /[áéíóúñ]/i },
    { lang: "German", pattern: /[äöüß]/i },
    { lang: "Italian", pattern: /[àèéìíîòóùú]/i },
    { lang: "Portuguese", pattern: /[áâãàçéêíóôõú]/i }
  ];

  // Check title and artist for language patterns
  for (const { lang, pattern } of languagePatterns) {
    if (title.match(pattern) || artist.match(pattern)) {
      return lang;
    }
  }

  // Check genre for language hints
  if (genre.includes('bollywood') || genre.includes('indian')) return "Hindi";
  if (genre.includes('k-pop')) return "Korean";
  if (genre.includes('j-pop')) return "Japanese";
  if (genre.includes('latin')) return "Spanish";
  if (genre.includes('reggaeton')) return "Spanish";

  // Default based on common patterns in your data
  if (artist.includes('gill') || artist.includes('dadlani') || artist.includes('raftaar')) {
    return "Hindi";
  }

  return "English"; // Default to English
}

/* -------------------------
   Helper functions & mappings
------------------------- */
function norm(s) { 
  return s ? s.toString().trim().toLowerCase() : ""; 
}

const similarMoods = {
  happy: ["energetic", "joyful", "upbeat", "celebratory"],
  energetic: ["happy", "party", "powerful", "driving"],
  romantic: ["intimate", "passionate", "loving", "dreamy"],
  sad: ["melancholy", "emotional", "heartbroken", "reflective"],
  angry: ["intense", "aggressive", "rebellious", "furious"],
  relaxed: ["calm", "peaceful", "chill", "mellow"]
};

const moodTextMap = {
  happy: ["Feeling happy? Enjoy these uplifting tunes!", "A joyful vibe just for you!", "Spread the happiness with these songs!"],
  sad: ["Need some comfort? These songs understand...", "It's okay to feel sad. Let the music heal.", "Melancholy melodies for your mood"],
  relaxed: ["Time to unwind with these chill tunes!", "Perfect relaxation soundtrack", "Calm vibes for your peaceful moment"],
  energetic: ["Get ready to move! High-energy picks!", "Power up with these energetic beats!", "Feel the energy with these tracks!"],
  romantic: ["Love is in the air with these romantic tunes!", "Perfect songs for your special moments", "Heartfelt melodies for romance"],
  angry: ["Channel that energy with these powerful tracks!", "Turn frustration into motivation!", "Strong beats for strong feelings"],
  default: ["Here are some recommendations for your mood!", "Curated picks just for you!", "Your personalized music selection"]
};

/* -------------------------
   Enhanced AI Recommendation Algorithm
------------------------- */
function getAIRecommendations(moodRaw, languageRaw, count = 6) {
  const mood = norm(moodRaw);
  const language = languageRaw && languageRaw !== "Any Language" ? norm(languageRaw) : "any language";

  console.log(`🔍 Searching for: mood=${mood}, language=${language}`);
  console.log(`📊 Total songs in database: ${musicDatabase.length}`);

  // Primary filter: exact mood + language match
  let filtered = musicDatabase.filter(song => {
    const songMood = norm(song.mood);
    const songLanguage = norm(song.language);
    const moodMatch = songMood === mood;
    const languageMatch = language === "any language" || songLanguage === language;
    
    return moodMatch && languageMatch;
  });

  console.log(`🎯 Primary filter found: ${filtered.length} songs`);

  // Secondary filter: similar moods
  if (filtered.length < count) {
    console.log(`🔄 Not enough primary matches. Trying similar moods for: ${mood}`);
    const similar = similarMoods[mood] || [];
    
    for (let similarMood of similar) {
      const additionalSongs = musicDatabase.filter(song => {
        const songMood = norm(song.mood);
        const songLanguage = norm(song.language);
        const moodMatch = songMood === similarMood;
        const languageMatch = language === "any language" || songLanguage === language;
        
        return moodMatch && languageMatch;
      });
      
      // Add only new songs that aren't already in filtered
      additionalSongs.forEach(song => {
        if (!filtered.some(s => s.title === song.title && s.artist === song.artist)) {
          filtered.push(song);
        }
      });
      
      if (filtered.length >= count * 2) break; // Get enough for variety
    }
    console.log(`🔄 After similar moods: ${filtered.length} songs`);
  }

  // Tertiary filter: any mood for the language
  if (filtered.length < count && language !== "any language") {
    console.log(`🌍 Trying any mood for language: ${language}`);
    const languageSongs = musicDatabase.filter(song => 
      norm(song.language) === language
    );
    
    languageSongs.forEach(song => {
      if (!filtered.some(s => s.title === song.title && s.artist === song.artist)) {
        filtered.push(song);
      }
    });
    console.log(`🌍 After language fallback: ${filtered.length} songs`);
  }

  // Final fallback: any song from database
  if (filtered.length === 0) {
    console.log("🎲 No matches found, returning random songs");
    filtered = [...musicDatabase];
  }

  // Randomize and limit results
  const shuffled = [...filtered].sort(() => 0.5 - Math.random());
  const results = shuffled.slice(0, Math.min(count, shuffled.length));
  
  console.log(`✅ Final recommendations: ${results.length} songs`);
  return results;
}

/* -------------------------
   AI Text Generator
------------------------- */
function getRandomText(mood) {
  const key = norm(mood);
  const arr = moodTextMap[key] || moodTextMap["default"];
  return arr[Math.floor(Math.random() * arr.length)];
}

/* -------------------------
   API Endpoints
------------------------- */
app.post("/api/mood", async (req, res) => {
  try {
    const { mood, language } = req.body;
    
    if (!mood || !mood.toString().trim()) {
      return res.status(400).json({ error: "Mood is required" });
    }

    // Ensure CSV is loaded before processing
    if (!isCSVLoaded) {
      await loadCSVData();
    }

    console.log(`📨 Received request: mood=${mood}, language=${language}`);
    
    const recommendations = getAIRecommendations(mood, language, 6);
    const aiText = getRandomText(mood);

    res.json({ 
      status: "ok", 
      aiText, 
      mood, 
      language: language || "Any Language", 
      totalFound: recommendations.length,
      totalInDatabase: musicDatabase.length,
      recommendations: recommendations
    });
  } catch (error) {
    console.error("❌ Error in /api/mood:", error);
    res.status(500).json({ error: "Internal server error: " + error.message });
  }
});

app.get("/api/moods", async (req, res) => {
  try {
    // Ensure CSV is loaded
    if (!isCSVLoaded) {
      await loadCSVData();
    }

    const moods = [...new Set(musicDatabase.map(s => s.mood))].sort();
    const languages = [...new Set(musicDatabase.map(s => s.language))].sort();
    
    console.log(`🌍 Sending ${languages.length} languages to frontend:`, languages);
    console.log(`🎭 Sending ${moods.length} moods to frontend:`, moods);
    
    res.json({ 
      status: "ok", 
      moods, 
      languages, 
      totalSongs: musicDatabase.length
    });
  } catch (error) {
    console.error("❌ Error in /api/moods:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// New endpoint to get database statistics
app.get("/api/stats", async (req, res) => {
  try {
    if (!isCSVLoaded) {
      await loadCSVData();
    }

    const stats = {
      totalSongs: musicDatabase.length,
      moods: {},
      languages: {}
    };

    // Count songs by mood and language
    musicDatabase.forEach(song => {
      stats.moods[song.mood] = (stats.moods[song.mood] || 0) + 1;
      stats.languages[song.language] = (stats.languages[song.language] || 0) + 1;
    });

    res.json({ status: "ok", ...stats });
  } catch (error) {
    console.error("❌ Error in /api/stats:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

// Search endpoint
app.get("/api/search", async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q) {
      return res.status(400).json({ error: "Query parameter required" });
    }

    if (!isCSVLoaded) {
      await loadCSVData();
    }

    const query = norm(q);
    const results = musicDatabase.filter(song => 
      norm(song.title).includes(query) ||
      norm(song.artist).includes(query) ||
      norm(song.language).includes(query) ||
      norm(song.mood).includes(query)
    ).slice(0, 20);

    res.json({ 
      status: "ok", 
      query: q,
      results 
    });
  } catch (error) {
    console.error("❌ Error in /api/search:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "../frontend/index.html"));
});

// Health check endpoint
app.get("/api/health", async (req, res) => {
  res.json({ 
    status: "ok", 
    csvLoaded: isCSVLoaded,
    totalSongs: musicDatabase.length,
    message: "Server is running successfully"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: "Endpoint not found" });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error("❌ Unhandled error:", error);
  res.status(500).json({ error: "Something went wrong!" });
});

/* -------------------------
   Initialize and Start Server
------------------------- */
async function initializeServer() {
  try {
    await loadCSVData();
    app.listen(port, () => {
      console.log(`🎵 AI Music Recommender running at http://localhost:${port}`);
      console.log(`📊 Total songs in database: ${musicDatabase.length}`);
      
      const languages = [...new Set(musicDatabase.map(s => s.language))].sort();
      console.log(`🌍 Available languages (${languages.length}):`, languages.join(', '));
      
      const moods = [...new Set(musicDatabase.map(s => s.mood))].sort();
      console.log(`🎭 Available moods (${moods.length}):`, moods.join(', '));
      
      console.log(`🔗 Frontend: http://localhost:3000`);
      console.log(`🔗 Backend API: http://localhost:${port}/api`);
    });
  } catch (error) {
    console.error("❌ Failed to initialize server:", error);
    console.error("💡 Make sure muse_v3.csv is in the backend folder");
    process.exit(1);
  }
}

initializeServer();