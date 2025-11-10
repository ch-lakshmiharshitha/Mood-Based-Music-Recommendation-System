// backend/server.js - COMPLETE CORRECTED VERSION

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

// Enhanced language detection function for muse_v3.csv
function detectLanguage(row) {
  const title = (row.track || '').toLowerCase().trim();
  const artist = (row.artist || '').toLowerCase().trim();
  const genre = (row.genre || '').toLowerCase().trim();
  const seeds = row.seeds ? row.seeds.toLowerCase() : '';

  // 1. First, check artist names for known language patterns
  const artistLanguageMap = {
    'Hindi': [
      'a.r. rahman', 'arijit singh', 'shreya ghoshal', 'sunidhi chauhan', 
      'kishore kumar', 'lata mangeshkar', 'raftaar', 'badshah', 'diljit',
      'neha kakkar', 'tony kakkar', 'jassie gill', 'guru randhawa', 'vishal',
      'aastha', 'shankar', 'sonu nigam', 'kumar sanu', 'alka yagnik'
    ],
    'Korean': [
      'bts', 'blackpink', 'exo', 'twice', 'red velvet', 'iu', 'bigbang',
      'seventeen', 'nct', 'got7', 'monsta x', 'stray kids', 'itzy', 'ateez'
    ],
    'Japanese': [
      'yoasobi', 'kenshi yonezu', 'hikaru utada', 'aimer', 'lisa',
      'official hige dandism', 'vaundy', 'eve', 'ado', 'kenshi',
      'radwimps', 'babymetal', 'one ok rock'
    ],
    'Spanish': [
      'bad bunny', 'j balvin', 'shakira', 'maluma', 'ozuna', 'daddy yankee',
      'anuel aa', 'karol g', 'rosalía', 'enrique iglesias', 'ricky martin',
      'luis fonsi', 'j lo', 'jennifer lopez', 'marc anthony'
    ],
    'French': [
      'stromae', 'indila', 'maître gims', 'zaz', 'christophe maé',
      'jain', 'angele', 'soprano', 'black m'
    ],
    'German': [
      'rammstein', 'tokio hotel', 'nena', 'helene fischer', 'mark forster'
    ],
    'Italian': [
      'andrea bocelli', 'laura pausini', 'eros ramazzotti', 'tiziano ferro'
    ]
  };

  // Check artist against known language patterns
  for (const [lang, artists] of Object.entries(artistLanguageMap)) {
    for (const knownArtist of artists) {
      if (artist.includes(knownArtist)) {
        return lang;
      }
    }
  }

  // 2. Check genre for language hints
  const genreLanguageMap = {
    'Hindi': ['bollywood', 'hindustani', 'indian pop', 'desi hip hop', 'punjabi', 'tamil', 'telugu'],
    'Korean': ['k-pop', 'korean pop', 'k-rap', 'korean hip hop'],
    'Japanese': ['j-pop', 'japanese pop', 'anime', 'j-rock', 'japanese rock'],
    'Spanish': ['latin', 'reggaeton', 'salsa', 'bachata', 'flamenco', 'mexican', 'tango'],
    'French': ['french pop', 'chanson française', 'french hip hop'],
    'German': ['german pop', 'schlager', 'german rock'],
    'Italian': ['italian pop', 'opera italiana', 'italian rock']
  };

  for (const [lang, genres] of Object.entries(genreLanguageMap)) {
    for (const genrePattern of genres) {
      if (genre.includes(genrePattern)) {
        return lang;
      }
    }
  }

  // 3. Character-based language detection
  const languagePatterns = [
    { lang: "Korean", pattern: /[가-힣]/ },
    { lang: "Japanese", pattern: /[一-龯]|[ぁ-ん]|[ァ-ン]/ },
    { lang: "Hindi", pattern: /[\u0900-\u097F]/ }, // Devanagari script
    { lang: "Arabic", pattern: /[\u0600-\u06FF]/ },
    { lang: "Russian", pattern: /[а-яё]/i },
    { lang: "Chinese", pattern: /[\u4e00-\u9fff]/ },
    { lang: "Thai", pattern: /[\u0e00-\u0e7f]/ },
    { lang: "Greek", pattern: /[α-ω]/i }
  ];

  for (const { lang, pattern } of languagePatterns) {
    if (title.match(pattern) || artist.match(pattern)) {
      return lang;
    }
  }

  // 4. Check for common English indicators
  const commonEnglishWords = [
    'the', 'and', 'you', 'love', 'baby', 'night', 'day', 'time', 'heart',
    'eyes', 'hands', 'world', 'life', 'dream', 'fire', 'water', 'sky',
    'girl', 'boy', 'man', 'woman', 'city', 'street', 'home', 'house'
  ];

  let englishScore = 0;
  commonEnglishWords.forEach(word => {
    const wordPattern = new RegExp(`\\b${word}\\b`, 'i');
    if (wordPattern.test(title)) {
      englishScore++;
    }
  });

  // 5. Final fallback logic
  if (englishScore >= 1) {
    return "English";
  }

  // If artist/title contains mostly ASCII characters and common English patterns
  const isMostlyAscii = /^[a-zA-Z0-9\s\-\'\!\.\?\,\&]+$/.test(title);
  if (isMostlyAscii && title.length > 0) {
    return "English";
  }

  // Default to English for unknown cases
  return "English";
}

// Function to map seeds to mood
function mapSeedsToMood(seeds, row) {
  // Convert seeds to lowercase for easier matching
  const seedWords = seeds.map(seed => seed.toLowerCase());
  
  // Map seeds to moods
  if (seedWords.includes('happy') || seedWords.includes('fun') || seedWords.includes('joyful') || seedWords.includes('uplifting')) {
    return "happy";
  }
  if (seedWords.includes('sad') || seedWords.includes('melancholy') || seedWords.includes('emotional') || seedWords.includes('heartbreak')) {
    return "sad";
  }
  if (seedWords.includes('energetic') || seedWords.includes('aggressive') || seedWords.includes('intense') || seedWords.includes('powerful')) {
    return "energetic";
  }
  if (seedWords.includes('relaxed') || seedWords.includes('calm') || seedWords.includes('chill') || seedWords.includes('peaceful')) {
    return "relaxed";
  }
  if (seedWords.includes('romantic') || seedWords.includes('sexy') || seedWords.includes('love') || seedWords.includes('intimate')) {
    return "romantic";
  }
  if (seedWords.includes('angry') || seedWords.includes('aggressive') || seedWords.includes('rebellious')) {
    return "angry";
  }

  // Fallback to valence-based mood detection
  const valence = parseFloat(row.valence_tags) || 0.5;
  const arousal = parseFloat(row.arousal_tags) || 0.5;
  
  if (valence > 0.7 && arousal > 0.6) return "happy";
  if (valence < 0.4 && arousal < 0.5) return "sad";
  if (arousal > 0.7) return "energetic";
  if (arousal < 0.4) return "relaxed";
  if (valence > 0.5 && valence < 0.7) return "romantic";
  
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
            // Clean and parse the seeds column - handle different formats
            const seedsStr = row.seeds || '[]';
            // Remove brackets and split by comma, handling quotes
            const cleanedSeeds = seedsStr.replace(/[\[\]']/g, '').split(',').map(s => s.trim()).filter(s => s);
            seeds = cleanedSeeds;
          } catch (e) {
            console.warn('Error parsing seeds for row:', row.track, e.message);
          }

          // Create the song object with proper language detection
          const song = {
            title: row.track || 'Unknown Title',
            artist: row.artist || 'Unknown Artist',
            mood: mapSeedsToMood(seeds, row),
            language: detectLanguage(row),
            spotifyId: row.spotify_id || generateSpotifyId(),
            youtubeUrl: generateYouTubeSearchUrl(row.track, row.artist),
            tags: seeds.slice(0, 5),
            genre: row.genre || 'Unknown',
            features: {
              valence: parseFloat(row.valence_tags) || 0.5,
              energy: parseFloat(row.arousal_tags) || 0.5,
              danceability: 0.5,
              acousticness: 0.5,
              tempo: 120,
              loudness: -6
            },
            // Keep original seeds for debugging
            originalSeeds: seeds
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
        
        // Analyze language distribution
        analyzeLanguageDistribution();
        
        resolve();
      })
      .on('error', (error) => {
        console.error('❌ Error loading CSV:', error);
        reject(error);
      });
  });
}

// Add this debug function
function analyzeLanguageDistribution() {
  console.log('\n🔍 ANALYZING LANGUAGE DISTRIBUTION');
  console.log('================================');
  
  const languageCounts = {};
  const languageSamples = {};
  
  musicDatabase.forEach(song => {
    languageCounts[song.language] = (languageCounts[song.language] || 0) + 1;
    
    // Collect samples for each language
    if (!languageSamples[song.language]) {
      languageSamples[song.language] = [];
    }
    if (languageSamples[song.language].length < 3) {
      languageSamples[song.language].push({
        title: song.title,
        artist: song.artist,
        genre: song.genre,
        mood: song.mood
      });
    }
  });
  
  // Log distribution
  console.log('\n📈 Language Distribution:');
  Object.entries(languageCounts)
    .sort(([,a], [,b]) => b - a)
    .forEach(([lang, count]) => {
      console.log(`   ${lang}: ${count} songs (${((count / musicDatabase.length) * 100).toFixed(1)}%)`);
    });
  
  // Log samples
  console.log('\n🎵 Language Samples:');
  Object.entries(languageSamples).forEach(([lang, samples]) => {
    console.log(`\n   ${lang}:`);
    samples.forEach(sample => {
      console.log(`     - "${sample.title}" by ${sample.artist} [${sample.genre}] - ${sample.mood}`);
    });
  });
  
  console.log('\n================================\n');
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

  console.log(`🔍 Searching for: mood="${mood}", language="${language}"`);
  console.log(`📊 Total songs in database: ${musicDatabase.length}`);

  // STRICT Primary filter: exact mood + exact language match
  let filtered = musicDatabase.filter(song => {
    const songMood = norm(song.mood);
    const songLanguage = norm(song.language);
    
    const moodMatch = songMood === mood;
    const languageMatch = language === "any language" || songLanguage === language;
    
    return moodMatch && languageMatch;
  });

  console.log(`🎯 Primary filter found: ${filtered.length} songs`);

  // If no results found, show helpful message
  if (filtered.length === 0) {
    console.log(`❌ No songs found for mood="${mood}" and language="${language}"`);
    
    // Check what's available for this language
    const availableForLanguage = musicDatabase.filter(song => 
      norm(song.language) === language
    );
    
    // Check what's available for this mood
    const availableForMood = musicDatabase.filter(song => 
      norm(song.mood) === mood
    );
    
    console.log(`💡 Available for language "${language}": ${availableForLanguage.length} songs`);
    console.log(`💡 Available for mood "${mood}": ${availableForMood.length} songs`);
    
    // If no exact matches, try similar moods but ONLY for the same language
    if (language !== "any language") {
      console.log(`🔄 Trying similar moods for language: ${language}`);
      const similar = similarMoods[mood] || [];
      
      for (let similarMood of similar) {
        const additionalSongs = musicDatabase.filter(song => {
          const songMood = norm(song.mood);
          const songLanguage = norm(song.language);
          const moodMatch = songMood === similarMood;
          const languageMatch = songLanguage === language;
          
          return moodMatch && languageMatch;
        });
        
        // Add only new songs that aren't already in filtered
        additionalSongs.forEach(song => {
          if (!filtered.some(s => s.title === song.title && s.artist === song.artist)) {
            filtered.push(song);
          }
        });
        
        if (filtered.length >= count * 2) break;
      }
      console.log(`🔄 After similar moods: ${filtered.length} songs`);
    }
  }

  // Final fallback: if still no results and language was specified, return empty
  if (filtered.length === 0 && language !== "any language") {
    console.log("🎯 No matches found for the specified language, returning empty results");
    return [];
  }

  // Ultimate fallback: any song from database (only if language was "any language" or no language specified)
  if (filtered.length === 0) {
    console.log("🎲 No matches found, returning random songs from any language");
    filtered = musicDatabase.filter(song => norm(song.mood) === mood);
    if (filtered.length === 0) {
      filtered = [...musicDatabase];
    }
  }

  // Randomize and limit results
  const shuffled = [...filtered].sort(() => 0.5 - Math.random());
  const results = shuffled.slice(0, Math.min(count, shuffled.length));
  
  console.log(`✅ Final recommendations: ${results.length} songs`);
  
  // Log the actual languages of the results for debugging
  if (results.length > 0) {
    const resultLanguages = [...new Set(results.map(song => song.language))];
    console.log(`🌍 Languages in results: ${resultLanguages.join(', ')}`);
  }
  
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

    console.log(`📨 Received request: mood="${mood}", language="${language}"`);
    
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