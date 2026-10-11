# Unity WebGL Analytics Integration Prompt

## Objective

Integrate Umami analytics event tracking into the Unity WebGL game "Sick Of It" to track player actions and game events.

## Context

The website has Umami Analytics configured with a JavaScript wrapper (`umami-game-events.js`) that provides functions to track custom events. Unity needs to call these JavaScript functions using WebGL's JavaScript interop functionality.

## Requirements

### 1. Create Analytics Manager Script

Create a C# script called `AnalyticsManager.cs` that provides an interface for tracking game events.

**Features needed:**
- Singleton pattern for easy access throughout the game
- JavaScript interop using `[DllImport("__Internal")]` for WebGL builds
- Fallback for non-WebGL builds (editor play mode) - just log to console
- Methods for tracking:
  - Game start
  - Level completions (levels 1-4)
  - Player death
  - Game over
  - Menu actions (optional)

### 2. Event Tracking Points

Implement tracking at these key points:

**Game Start:**
- Track when the game initializes and player can interact
- Event name: `game_start`
- Call location: After main menu loads OR when gameplay begins

**Level Completion:**
- Track when each level is completed
- Event names: `level1_complete`, `level2_complete`, `level3_complete`, `level4_complete`
- Call location: When player reaches level end/exit

**Player Death (Optional):**
- Track when player dies
- Event name: `player_death`
- Call location: Player death handler

**Game Over (Optional):**
- Track game over state
- Event name: `game_over`
- Call location: Game over screen

### 3. Implementation Details

**JavaScript Functions Available:**

The following JavaScript functions are available in `umami-game-events.js`:

```javascript
// Main tracking function
window.umamiTrack(eventName, eventData)

// Convenience functions
window.trackGameStart()
window.trackLevel1Complete()
window.trackLevel2Complete()
window.trackLevel3Complete()
window.trackLevel4Complete()
window.trackLevelComplete(levelNumber)
window.trackPlayerDeath(cause)
window.trackGameOver()
```

**Unity C# Implementation Pattern:**

```csharp
using UnityEngine;
using System.Runtime.InteropServices;

public class AnalyticsManager : MonoBehaviour
{
    private static AnalyticsManager instance;
    
    public static AnalyticsManager Instance
    {
        get
        {
            if (instance == null)
            {
                GameObject go = new GameObject("AnalyticsManager");
                instance = go.AddComponent<AnalyticsManager>();
                DontDestroyOnLoad(go);
            }
            return instance;
        }
    }

    // JavaScript interop for WebGL builds
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")]
    private static extern void trackGameStart();
    
    [DllImport("__Internal")]
    private static extern void trackLevel1Complete();
    
    [DllImport("__Internal")]
    private static extern void trackLevel2Complete();
    
    [DllImport("__Internal")]
    private static extern void trackLevel3Complete();
    
    [DllImport("__Internal")]
    private static extern void trackLevel4Complete();
    
    [DllImport("__Internal")]
    private static extern void trackPlayerDeath(string cause);
    
    [DllImport("__Internal")]
    private static extern void trackGameOver();
#endif

    // Public methods that can be called from anywhere in the game
    public void TrackGameStart()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        try
        {
            trackGameStart();
            Debug.Log("[Analytics] Tracked: game_start");
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[Analytics] Failed to track game_start: {e.Message}");
        }
#else
        Debug.Log("[Analytics] (Simulated) Tracked: game_start");
#endif
    }

    public void TrackLevelComplete(int levelNumber)
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        try
        {
            switch (levelNumber)
            {
                case 1:
                    trackLevel1Complete();
                    break;
                case 2:
                    trackLevel2Complete();
                    break;
                case 3:
                    trackLevel3Complete();
                    break;
                case 4:
                    trackLevel4Complete();
                    break;
            }
            Debug.Log($"[Analytics] Tracked: level{levelNumber}_complete");
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[Analytics] Failed to track level{levelNumber}_complete: {e.Message}");
        }
#else
        Debug.Log($"[Analytics] (Simulated) Tracked: level{levelNumber}_complete");
#endif
    }

    public void TrackPlayerDeath(string cause = "")
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        try
        {
            trackPlayerDeath(cause);
            Debug.Log($"[Analytics] Tracked: player_death (cause: {cause})");
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[Analytics] Failed to track player_death: {e.Message}");
        }
#else
        Debug.Log($"[Analytics] (Simulated) Tracked: player_death (cause: {cause})");
#endif
    }

    public void TrackGameOver()
    {
#if UNITY_WEBGL && !UNITY_EDITOR
        try
        {
            trackGameOver();
            Debug.Log("[Analytics] Tracked: game_over");
        }
        catch (System.Exception e)
        {
            Debug.LogWarning($"[Analytics] Failed to track game_over: {e.Message}");
        }
#else
        Debug.Log("[Analytics] (Simulated) Tracked: game_over");
#endif
    }
}
```

### 4. Integration Points

**Where to add tracking calls:**

1. **Game Start:**
   - Find the script that handles game initialization or main menu
   - Add: `AnalyticsManager.Instance.TrackGameStart();`
   - Should be called once when the player can start interacting

2. **Level Completion:**
   - Find the script that handles level completion/progression
   - Add: `AnalyticsManager.Instance.TrackLevelComplete(currentLevel);`
   - Call when player successfully completes a level

3. **Player Death (Optional):**
   - Find the player health/death script
   - Add: `AnalyticsManager.Instance.TrackPlayerDeath("enemy");`
   - Include cause if possible (e.g., "enemy", "fall", "trap")

4. **Game Over (Optional):**
   - Find the game over screen script
   - Add: `AnalyticsManager.Instance.TrackGameOver();`

### 5. Testing

**In Unity Editor:**
- Play the game
- Check Console for log messages like: `[Analytics] (Simulated) Tracked: game_start`
- Verify tracking is called at appropriate times

**In WebGL Build:**
- Build and deploy the game
- Open browser console (F12)
- Play the game
- Look for messages like: `[Umami] Tracked event: game_start`
- Verify events appear in Umami dashboard (website.com/blog/development.html)

### 6. Build Settings

Ensure WebGL build settings are correct:
- **Publishing Settings:**
  - Compression Format: Gzip or Brotli
  - Enable Exception Support: Full (for better error handling)
- **Player Settings:**
  - Enable WebGL 2.0

### 7. Deliverables

- [ ] `AnalyticsManager.cs` script created and added to scene
- [ ] Game start event tracked
- [ ] Level completion events tracked (at minimum level 1)
- [ ] Player death tracked (optional but recommended)
- [ ] Game over tracked (optional)
- [ ] Tested in Unity Editor with console logs
- [ ] Tested in WebGL build with browser console
- [ ] Events visible in Umami analytics dashboard

### 8. Notes

- The `#if UNITY_WEBGL && !UNITY_EDITOR` preprocessor directives ensure JavaScript calls only happen in WebGL builds
- The `[DllImport("__Internal")]` syntax tells Unity to look for JavaScript functions in the browser environment
- Make sure to catch exceptions to prevent crashes if analytics fails
- Analytics failures should be logged but never interrupt gameplay
- The JavaScript wrapper (`umami-game-events.js`) already handles checking if Umami is loaded

### 9. Example Usage in Existing Scripts

**In your level manager:**
```csharp
void OnLevelComplete()
{
    // Existing level completion code...
    
    // Track analytics
    AnalyticsManager.Instance.TrackLevelComplete(currentLevelNumber);
    
    // Continue with level transition...
}
```

**In your game manager:**
```csharp
void Start()
{
    // Existing initialization...
    
    // Track game start
    AnalyticsManager.Instance.TrackGameStart();
}
```

## Questions to Consider

1. Where is the best place to track game start? (After loading, after menu selection, etc.)
2. How do you currently detect level completion?
3. Do you have a centralized game manager or level manager?
4. Do you want to track additional events beyond the core requirements?

## Success Criteria

- Game events are tracked in WebGL builds without errors
- Events appear in the Umami analytics dashboard at `/blog/development.html`
- The Unity Editor shows simulated tracking logs for testing
- No gameplay disruption from analytics code
