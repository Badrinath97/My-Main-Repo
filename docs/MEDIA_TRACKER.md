# Media Tracker

A reusable Lightning Web Component for tracking movies, TV series, anime, books, games, podcasts and any other kind of entertainment in one place.

## Folder layout

All the feature's metadata is in one self-contained folder:

```
force-app/main/MediaTracker/
├─ DataAccess/
│  └─ classes/       Data classes (MediaItemData, MediaSeasonData, MediaFilterData,
│                    MediaPageData, MediaStatsData, MediaTypeConfigData) and selectors
│                    (MediaItemSelector, MediaSeasonSelector, MediaTypeConfigSelector)
├─ classes/          MediaItemService, MediaSeasonService, MediaTrackerController,
│                    tests, MediaTestDataFactory
├─ triggers/         MediaSeasonTrigger (keeps item progress in sync with its seasons)
├─ lwc/              mediaTracker, mediaCard, mediaFilterBar, mediaStats,
│                    mediaItemForm, mediaTrackerUtils
├─ objects/          Media_Item__c, Media_Season__c, Media_Type_Config__mdt
│                    (fields, validation rules, list view)
├─ customMetadata/   Media_Type_Config records
├─ permissionsets/   Media_Tracker_User
├─ applications/     Media_Tracker Lightning app (App Launcher)
├─ flexipages/       Media_Tracker app page that hosts the mediaTracker component
├─ layouts/          Media Item (with a Seasons related list) and Media Season layouts
└─ tabs/             Media_Tracker (opens the app page), Media_Item__c (records)
```

The Salesforce CLI deploys every folder under `force-app`, so this layout needs no extra configuration. Metadata you **retrieve** from an org still lands in `force-app/main/default/`, so move it in here if it belongs to this feature.

## Architecture

```
LWC (UI)                          Apex
──────────────────────────────    ───────────────────────────────────────────────
mediaTracker  (container)   ───►  MediaTrackerController   thin @AuraEnabled facade
 ├─ mediaStats                          │
 ├─ mediaFilterBar                      ▼
 ├─ mediaCard  (× n)              MediaItemService         business rules, DML
 └─ mediaItemForm (modal)               │
mediaTrackerUtils (shared)              ▼
                                  MediaItemSelector        all SOQL (USER_MODE)
                                  MediaTypeConfigSelector
                                        │
                                  Data classes (DTOs): MediaItemData, MediaFilterData,
                                  MediaPageData, MediaStatsData, MediaTypeConfigData
```

| Layer          | Responsibility                                                                                                                                         | Rules                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Data**       | The contract between the UI and Apex. Maps to and from `Media_Item__c`.                                                                                | No queries and no DML.                                                                       |
| **Selector**   | Every query. Always scoped to the running user's items.                                                                                                | `USER_MODE`, bind variables, and a whitelist for sort and group fields.                      |
| **Service**    | Status lifecycle, progress, defaults, ownership checks, stats.                                                                                         | No SOQL. Selectors can be swapped in tests through `@TestVisible`.                           |
| **Controller** | Exposes service methods to LWC and turns exceptions into `AuraHandledException`.                                                                       | No logic.                                                                                    |
| **LWC**        | The container owns state and server calls. The children only display data and raise events (`edit`, `delete`, `favorite`, `progress`, `filterchange`). | Children never call Apex. The modal is the one exception, so it can show save errors inline. |

## Data model

- **`Media_Item__c`**: private sharing, so each user sees only their own list. Fields: Title, Media Type, Status, Rating (0–10), Genre, Platform, Release Year, Progress Current/Total, Progress % (formula), Start/Completed Date, Favorite, Poster URL, Notes.
- **`Media_Season__c`**: one row per season of a TV series or anime (Master-Detail to `Media_Item__c`). Fields: Season Number (0 = specials), Episodes (blank while still airing), Episodes Watched.
- **`Media_Type_Config__mdt`**: sets how each type behaves (icon, whether progress is tracked, progress unit such as _Episodes_, _Pages_ or _Hours_, whether the type has **seasons**, and sort order). Seasons are on for TV Series and Anime.

### Business rules (MediaItemService)

- New items default to **Planned**.
- **+1 progress** moves a Planned item to **In Progress**. Reaching the total marks it **Completed**. Progress stays between 0 and the total.
- **Completed** sets the completed date to today and fills progress to the total. Moving an item out of Completed clears the completed date.
- Any status after Planned sets the start date to today if it is empty.
- Decreasing progress on a Completed item reopens it (In Progress, or Planned if progress is back to 0).

### Seasons (MediaSeasonService)

- When an item has seasons, its overall progress is **calculated from them**: watched = total episodes watched across all seasons, and total = total episodes across all seasons. The total stays blank while any season's episode count is unknown.
- **+1** advances the first unfinished season (finishing Season 1 moves on to Season 2). **−1** rewinds the last season that has any episodes watched.
- Marking an item **Completed** fills every season whose episode count is known.
- `MediaSeasonTrigger` recalculates the item whenever a season is created, edited or deleted from _anywhere_ (the tracker, the record page's Seasons related list, Data Loader, flows).
- If every season is removed, the item keeps its last progress values and you can edit them by hand again.

## Setup

```bash
sf project deploy start --source-dir force-app --target-org <alias>
sf org assign permset --name Media_Tracker_User --target-org <alias>
```

Then open Lightning App Builder and drag **Media Tracker** onto an App, Home or Record page.

### Component properties

| Property              | Default            | Purpose                                                             |
| --------------------- | ------------------ | ------------------------------------------------------------------- |
| Title                 | `My Media Tracker` | Card header                                                         |
| Limit to media types  | _(blank = all)_    | Comma-separated values, e.g. `Anime` or `Movie,TV Series`           |
| Default view          | `grid`             | `grid` or `list`                                                    |
| Default sort          | `lastModified`     | `title`, `rating`, `releaseYear`, `progress`, `mediaType`, `status` |
| Items per page        | `12`               | 1–200. A **Load more** button fetches the next page.                |
| Hide statistics / Add | `false`            | Use these for compact layouts                                       |

Example: put three instances on one app page, titled "Anime", "Movies" and "Reading", each limited to its own type.

## Adding a new kind of entertainment (no code)

1. Add a value to the **`Media_Item__c.Media_Type__c`** picklist (e.g. `Manga`).
2. _(Optional)_ Add a **Media Type Config** record with `Media_Type__c = Manga`, `Tracks_Progress__c = true`, `Progress_Unit__c = Chapters`, and an icon.

The new type appears in the filter, the form and the stats right away. Without a config record it still works, with default settings: no progress tracking and a generic icon. To hide a type, set `Is_Active__c = false` on its config record.

## Poster images

Poster URLs point to external sites. If posters don't appear, add the image host (e.g. `https://image.tmdb.org`) as a **CSP Trusted Site** with _img-src_ allowed. When an image fails to load, the card shows the media type icon instead.

## Tests

- Apex: `MediaItemServiceTest`, `MediaItemSelectorTest`, `MediaTrackerControllerTest` (shared data comes from `MediaTestDataFactory`). They run as a Standard User with the permission set, so CRUD, FLS and sharing are enforced just as in production.
- LWC Jest: `npm run test:unit`
- **Known quirk:** if you deploy `Media_Season__c` _and_ run the Apex tests in the same deployment, the season tests fail with "sObject type 'Media_Season__c' is not supported". The updated permission set does not take effect inside that deployment's own test run. Deploy first, then run the tests (`sf apex run test --test-level RunLocalTests`).
