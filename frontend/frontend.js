// frontend/frontend.js - COMPLETE UPDATED VERSION

document.addEventListener("DOMContentLoaded", () => {
  const moodInput = document.getElementById("mood");
  const languageSelect = document.getElementById("language");
  const musicButton = document.getElementById("music");
  const playlistButton = document.getElementById("playlist");
  const embedDiv = document.getElementById("embed-iframe");

  // Show loading state
  function showLoading(message = "Loading...") {
    embedDiv.innerHTML = `
      <div class="loading">
        <div class="spinner"></div>
        <p>${message}</p>
      </div>
    `;
  }

  // Show error message
  function showError(message) {
    embedDiv.innerHTML = `<div class="error"><strong>Error:</strong> ${message}</div>`;
  }

  // Show success message
  function showSuccess(message) {
    embedDiv.innerHTML = `<div class="success">${message}</div>`;
  }

  // Test backend connection
  async function testBackendConnection() {
    try {
      const response = await fetch('http://localhost:3001/api/health', {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error(`Backend responded with status: ${response.status}`);
      }
      
      const data = await response.json();
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  // Create Spotify embed with error handling
  function createSpotifyEmbed(spotifyId, songTitle, artist) {
    // For CSV dataset, we might not have real Spotify IDs, so we'll create a fallback
    if (!spotifyId || spotifyId.length < 10) {
      return createFallbackPlayer(songTitle, artist, 'spotify');
    }
    
    return `
      <div class="player-container">
        <iframe 
          src="https://open.spotify.com/embed/track/${spotifyId}" 
          width="100%" 
          height="80" 
          frameborder="0" 
          allowtransparency="true" 
          allow="encrypted-media"
          loading="lazy"
          onerror="this.onerror=null; this.replaceWith(createFallbackPlayer('${songTitle}', '${artist}', 'spotify'));"
        >
        </iframe>
      </div>
    `;
  }

  // Create YouTube search card (replaces embedded videos)
  function createYouTubeSearchCard(songTitle, artist, youtubeUrl) {
    const searchQuery = encodeURIComponent(`${songTitle} ${artist} official music video`);
    
    return `
      <div class="youtube-search-card">
        <div class="song-info">
          <h4>${songTitle}</h4>
          <p class="artist">by ${artist}</p>
        </div>
        <div class="youtube-actions">
          <button onclick="searchOnYouTube('${searchQuery}')" class="youtube-search-btn">
            🔍 Search on YouTube
          </button>
          <a href="${youtubeUrl}" target="_blank" class="youtube-link-btn">
            📺 Open YouTube Search
          </a>
        </div>
      </div>
    `;
  }

  // Create fallback player when embeds fail
  function createFallbackPlayer(songTitle, artist, platform) {
    const searchQuery = encodeURIComponent(`${songTitle} ${artist}`);
    const platformName = platform === 'spotify' ? 'Spotify' : 'YouTube';
    
    return `
      <div class="fallback-player">
        <p>🎵 <strong>${songTitle}</strong> - ${artist}</p>
        <p class="fallback-message">${platformName} preview not available</p>
        <div class="fallback-buttons">
          <button onclick="searchOnYouTube('${searchQuery}')" class="search-btn">
            🔍 Search on YouTube
          </button>
          <button onclick="searchOnSpotify('${searchQuery}')" class="search-btn spotify-btn">
            🎵 Search on Spotify
          </button>
        </div>
      </div>
    `;
  }

  // Global function to search on YouTube
  window.searchOnYouTube = function(searchQuery) {
    const searchUrl = `https://www.youtube.com/results?search_query=${searchQuery}`;
    window.open(searchUrl, '_blank');
  };

  // Global function to search on Spotify
  window.searchOnSpotify = function(searchQuery) {
    const searchUrl = `https://open.spotify.com/search/${searchQuery}`;
    window.open(searchUrl, '_blank');
  };

  // Global function to create YouTube playlist
  window.createYouTubePlaylist = function() {
    const songCards = document.querySelectorAll('.youtube-card');
    let searchQueries = [];
    
    songCards.forEach(card => {
      const title = card.querySelector('h4').textContent;
      const artist = card.querySelector('.artist').textContent.replace('by ', '');
      searchQueries.push(`${title} ${artist}`);
    });
    
    if (searchQueries.length > 0) {
      const playlistQuery = searchQueries.join(' OR ');
      const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(playlistQuery)}`;
      window.open(searchUrl, '_blank');
    }
  };

  // Fetch languages dynamically from backend
  async function loadLanguages() {
    showLoading("Connecting to backend and loading languages...");
    
    try {
      // First test if backend is running
      const connection = await testBackendConnection();
      
      if (!connection.success) {
        showError(`Cannot connect to backend server. Please make sure:<br>
                  1. Backend is running on port 3001<br>
                  2. Server is started with: <code>node backend/server.js</code><br>
                  3. No other applications are using port 3001<br><br>
                  Error: ${connection.error}`);
        return;
      }

      // Now load languages from the moods endpoint
      const response = await fetch('http://localhost:3001/api/moods');
      
      if (!response.ok) {
        throw new Error(`Failed to load languages: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (data.status === "ok") {
        const languages = data.languages || [];
        
        // Clear existing options and add new ones
        languageSelect.innerHTML = '<option value="Any Language">Any Language</option>';
        
        if (languages.length > 0) {
          languages.forEach(lang => {
            const option = document.createElement('option');
            option.value = lang;
            option.textContent = lang;
            languageSelect.appendChild(option);
          });
          
          showSuccess(`✅ Backend connected! Loaded ${languages.length} languages from ${data.totalSongs.toLocaleString()} songs.`);
          console.log(`🌍 Loaded languages: ${languages.join(', ')}`);
        } else {
          showError('No languages found in the dataset. Please check your CSV file.');
        }
      } else {
        throw new Error(data.error || 'Unknown error loading languages');
      }
    } catch (err) {
      console.error("Error loading languages:", err);
      showError(`Failed to load languages: ${err.message}`);
    }
  }

  // Common function to get recommendations
  async function getRecommendations(platform) {
    const mood = moodInput.value.trim();
    const language = languageSelect.value;
    
    if (!mood) {
      showError("Please enter a mood! (e.g., happy, sad, relaxed, energetic, romantic, angry)");
      return;
    }

    // Test connection first
    const connection = await testBackendConnection();
    if (!connection.success) {
      showError(`Backend connection lost: ${connection.error}`);
      return;
    }

    try {
      showLoading(`Getting ${platform} recommendations for "${mood}"...`);

      const res = await fetch("http://localhost:3001/api/mood", {
        method: "POST",
        headers: { 
          "Content-Type": "application/json",
          "Accept": "application/json"
        },
        body: JSON.stringify({ 
          mood: mood.toLowerCase(), 
          language: language 
        })
      });

      // Check if response is OK
      if (!res.ok) {
        let errorMessage = `Server error: ${res.status} ${res.statusText}`;
        try {
          const errorData = await res.json();
          errorMessage = errorData.error || errorMessage;
        } catch (e) {
          // If response is not JSON, use status text
        }
        throw new Error(errorMessage);
      }

      const data = await res.json();
      
      // Check if API returned success
      if (data.status !== "ok") {
        throw new Error(data.error || "Unknown error from server");
      }
      
      if (platform === 'spotify') {
        displayMusicRecommendations(data);
      } else {
        displayYouTubeRecommendations(data);
      }

    } catch (err) {
      console.error("Error getting recommendations:", err);
      showError(`Failed to get recommendations: ${err.message}`);
    }
  }

  // Display Spotify music recommendations
  function displayMusicRecommendations(data) {
    if (!data.recommendations || data.recommendations.length === 0) {
      showError(`No songs found for "${data.mood}" mood in ${data.language}. Try a different mood or language.`);
      return;
    }

    let html = `
      <div class="ai-response">
        <h3>🎵 AI Recommendations for "${data.mood}" mood</h3>
        <p class="ai-text">${data.aiText}</p>
        <p class="results-info">Found ${data.totalFound} songs in ${data.language} (from ${data.totalInDatabase.toLocaleString()} total songs)</p>
        <div class="recommendations">
    `;
    
    data.recommendations.forEach((song, index) => {
      html += `
        <div class="song-card">
          <div class="song-header">
            <h4>${song.title}</h4>
            <span class="song-number">#${index + 1}</span>
          </div>
          <p class="artist">by ${song.artist}</p>
          <p class="details">${song.language} • ${song.mood}</p>
          ${song.tags && song.tags.length > 0 ? `<p class="tags">${song.tags.slice(0, 3).join(' • ')}</p>` : ''}
          ${createSpotifyEmbed(song.spotifyId, song.title, song.artist)}
        </div>
      `;
    });
    
    html += `</div>
      <div class="action-buttons">
        <button onclick="getNewRecommendations('spotify')" class="refresh-btn">🔄 Get New Recommendations</button>
      </div>
      <p class="disclaimer">Powered by AI analysis of ${data.totalInDatabase.toLocaleString()} songs from your dataset!</p>
    </div>`;
    
    embedDiv.innerHTML = html;
  }

  // Display YouTube recommendations
  function displayYouTubeRecommendations(data) {
    if (!data.recommendations || data.recommendations.length === 0) {
      showError(`No songs found for "${data.mood}" mood in ${data.language}. Try a different mood or language.`);
      return;
    }

    let html = `
      <div class="ai-response">
        <h3>📺 YouTube Playlist for "${data.mood}" mood</h3>
        <p class="ai-text">${data.aiText}</p>
        <p class="results-info">Found ${data.totalFound} songs in ${data.language} (from ${data.totalInDatabase.toLocaleString()} total songs)</p>
        <div class="youtube-playlist-info">
          <p>🎵 <strong>Playlist Created!</strong> Here are your recommended songs. Click the buttons below to search for each song on YouTube.</p>
        </div>
        <div class="youtube-recommendations">
    `;
    
    data.recommendations.forEach((song, index) => {
      html += `
        <div class="youtube-card">
          <div class="song-header">
            <h4>${song.title}</h4>
            <span class="song-number">#${index + 1}</span>
          </div>
          <p class="artist">by ${song.artist}</p>
          <p class="details">${song.language} • ${song.mood}</p>
          ${song.tags && song.tags.length > 0 ? `<p class="tags">${song.tags.slice(0, 3).join(' • ')}</p>` : ''}
          ${createYouTubeSearchCard(song.title, song.artist, song.youtubeUrl)}
        </div>
      `;
    });
    
    html += `</div>
      <div class="action-buttons">
        <button onclick="getNewRecommendations('youtube')" class="refresh-btn">🔄 Get New Recommendations</button>
        <button onclick="createYouTubePlaylist()" class="playlist-btn">🎵 Create YouTube Playlist</button>
      </div>
      <p class="disclaimer">Powered by AI analysis of ${data.totalInDatabase.toLocaleString()} songs from your dataset!</p>
    </div>`;
    
    embedDiv.innerHTML = html;
  }

  // AI Recommendations (Spotify)
  musicButton.addEventListener("click", () => {
    getRecommendations('spotify');
  });

  // YouTube Playlist
  playlistButton.addEventListener("click", () => {
    getRecommendations('youtube');
  });

  // Sample mood click handlers
  document.querySelectorAll('.mood-text').forEach(el => {
    el.addEventListener('click', () => {
      const moodText = el.textContent.replace(/I feel |I am |I need to |I want to /gi, "").trim();
      moodInput.value = moodText;
      moodInput.focus();
    });
  });

  // Add global function for refresh buttons
  window.getNewRecommendations = function(platform) {
    getRecommendations(platform);
  };

  // Load languages on page load
  loadLanguages();

  // Add Enter key support for mood input
  moodInput.addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      getRecommendations('spotify');
    }
  });
});
