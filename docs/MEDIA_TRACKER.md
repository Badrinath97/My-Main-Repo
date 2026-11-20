# Media Tracker

A reusable Lightning Web Component for tracking movies, TV series, anime, books, games, podcasts and any other kind of entertainment in one place.

## Folder layout

All the feature's metadata is in one self-contained folder:

```
force-app/main/MediaTracker/
├─ DataAccess/
│  └─ classes/       Data classes (MediaItemData, MediaSeasonData, MediaCollectionData,
│                    MediaFilterData, MediaPageData, MediaStatsData, MediaTypeConfigData)
│                    and selectors (MediaItemSelector, MediaSeasonSelector,
│                    MediaCollectionSelector, MediaTypeConfigSelector)
├─ classes/          MediaItemService, MediaSeasonService, MediaCollectionService,
│                    MediaTrackerController, tests, MediaTestDataFactory
├─ triggers/         MediaSeasonTrigger (keeps item progress in sync with its seasons)
├─ lwc/              mediaTracker, mediaCard, mediaFilterBar, mediaStats,
│                    mediaItemForm, mediaItemDetail, mediaItemDetailModal,
│                    mediaCollectionList, mediaCollectionForm,
│                    mediaTrackerUtils (shared JS), mediaTrackerStyles (shared CSS)
├─ objects/          Media_Item__c, Media_Season__c, Media_Collection__c,
│                    Media_Type_Config__mdt
│                    (fields, validation rules, list view)
├─ customMetadata/   Media_Type_Config records
├─ permissionsets/   Media_Tracker_User
├─ applications/     Media_Tracker Lightning app (App Launcher)
├─ flexipages/       Media_Tracker app page that hosts the mediaTracker component
├─ layouts/          Media Item (Seasons related list), Media Season, Media Collection
│                    (Media Items and Sub-collections related lists)
└─ tabs/             Media_Tracker (opens the app page), Media_Item__c, Media_Collection__c
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
 ├─ mediaCollectionList           MediaSeasonService
 ├─ mediaItemForm (modal)         MediaCollectionService
 ├─ mediaItemDetailModal                │
 │   └─ mediaItemDetail                 │
 └─ mediaCollectionForm (modal)         │
mediaTrackerUtils / Styles (shared)     ▼
                                  MediaItemSelector        all SOQL (USER_MODE)
                                  MediaSeasonSelector
                                  MediaCollectionSelector
                                  MediaTypeConfigSelector
                                        │
                                  Data classes (DTOs): MediaItemData, MediaSeasonData,
                                  MediaCollectionData, MediaFilterData, MediaPageData,
                                  MediaStatsData, MediaTypeConfigData
```

| Layer          | Responsibility                                                                                                                                         | Rules                                                                                        |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| **Data**       | The contract between the UI and Apex. Maps to and from `Media_Item__c`.                                                                                | No queries and no DML.                                                                       |
| **Selector**   | Every query. Always scoped to the running user's items.                                                                                                | `USER_MODE`, bind variables, and a whitelist for sort and group fields.                      |
| **Service**    | Status lifecycle, progress, defaults, ownership checks, stats.                                                                                         | No SOQL. Selectors can be swapped in tests through `@TestVisible`.                           |
| **Controller** | Exposes service methods to LWC and turns exceptions into `AuraHandledException`.                                                                       | No logic.                                                                                    |
| **LWC**        | The container owns state and server calls. The children only display data and raise events (`edit`, `delete`, `favorite`, `progress`, `filterchange`). | Children never call Apex. The modals are the exception, so they can show save errors inline. |

## Data model

- **`Media_Item__c`**: private sharing, so each user sees only their own list. Fields: Title, Media Type, Status, Rating (0–10), Genre, Platform, Release Year, Progress Current/Total, Progress % (formula), Start/Completed Date, Favorite, Poster URL, Notes, **Language**, **Collection** (lookup) and **Order in Collection**.
- **`Media_Season__c`**: one row per season of a TV series or anime, **or per related movie** (Master-Detail to `Media_Item__c`). Fields: Entry Type (Season / Movie), Season Number (0 = specials; for movies, the position in the list), Episodes (blank while still airing), Episodes Watched, Aired Date (season start / movie release), Completed Date (season finished airing; not used for movies). A movie is stored as one episode: watched or not.
- **`Media_Collection__c`**: a franchise, cinematic universe, film series or phase (private sharing, like items). Fields: Collection Name, Collection Type (Cinematic Universe, Franchise, Series / Sequels, Phase / Saga, Other), Parent Collection (self-lookup, for nesting), Description, Poster URL.
- **`Media_Type_Config__mdt`**: sets how each type behaves (icon, whether progress is tracked, progress unit such as _Episodes_, _Pages_ or _Hours_, whether the type has **seasons** or **related movies**, which **form fields to hide**, and sort order). Seasons and movies are on for TV Series and Anime.

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

### Related movies (anime / series films)

- The item form has a **Movies** section with an **Add movie** button for types with `Tracks_Movies__c` (Anime, TV Series). Each row has a title and a **Watched** checkbox.
- Movies are tracked **separately from episodes**: they don't change "13 / 18 Episodes", and +1 / −1 never steps into a movie. The card shows "Movies · 1 / 2 watched", and hovering over that line lists the titles.
- Movies keep the order of the list (numbered 1, 2, 3...). Saving only seasons leaves movies untouched, and saving only movies leaves seasons untouched.
- Marking the item **Completed** also marks its movies watched.
- To track a film as a full item instead (its own rating, status and card), add it as a separate **Movie** and put both in the same **collection**.

### Collections and language (MediaCollectionService)

- An item belongs to **at most one** collection. To model "Avengers: Endgame is in the Infinity Saga, which is part of the MCU", **nest** collections: create _Marvel Cinematic Universe_, then _Infinity Saga_ with Parent = MCU, and file the film under Infinity Saga.
- Collections work for **every** media type (MCU films and series, a book saga, a game franchise).
- Filtering by a collection **includes its sub-collections**, so MCU shows Infinity Saga titles too. Picking a collection switches the sort to **Collection order**: grouped by collection, then by Order in Collection, then by release year.
- The collections view shows each collection's item and completed counts, **rolled up** from its sub-collections.
- A collection can't be moved inside itself or one of its own sub-collections.
- Deleting a collection **keeps its titles** (they leave the collection) and moves its sub-collections to the top level.
- Items can only be added to the running user's own collections.
- **Language** is a picklist (English, Hindi, Tamil, Telugu, Malayalam, Kannada, Bengali, Marathi, Japanese, Korean, Chinese, Spanish, French, German, Italian, Portuguese, Other). Add languages or collection types in Setup → Object Manager; the UI picks them up with no code change.

### Using collections in the tracker

- **Create:** click the **Collections** view button (layers icon) → **New collection**, or choose **+ New collection...** in an item's Collection field to create it while saving the item.
- **Assign:** edit a title and set **Collection** and **Order** (e.g. Iron Man = 1).
- **Browse:** click a collection in the Collections view, use the **Collection** filter, or click the collection chip on any card ("Infinity Saga #3").
- **Language:** set it on the item form; filter with the **Language** filter. It shows in the card subtitle.

## Setup

```bash
sf project deploy start --source-dir force-app --target-org <alias>
sf org assign permset --name Media_Tracker_User --target-org <alias>
```

Then open Lightning App Builder and drag **Media Tracker** onto an App, Home or Record page.

### Viewing an item

Click a card's poster or title (or press Enter on a focused poster, or choose **View details** in the card menu) to open the details window on the same page. It shows the poster, status, star rating, overall progress, key facts, a season table with per-season progress and airing dates, the related movies and notes. From there, **Edit** opens the form and **Open record page** goes to the standard record. Fields hidden for a type in the form are hidden in the details window too.

Dates are formatted in the user's Salesforce locale (e.g. `Oct 3, 2002` for en_US, `3 Oct 2002` for en_IN).

### Component properties

| Property              | Default            | Purpose                                                                                |
| --------------------- | ------------------ | -------------------------------------------------------------------------------------- |
| Title                 | `My Media Tracker` | Card header                                                                            |
| Limit to media types  | _(blank = all)_    | Comma-separated values, e.g. `Anime` or `Movie,TV Series`                              |
| Default view          | `grid`             | `grid`, `list` or `collections`                                                        |
| Default sort          | `lastModified`     | `title`, `rating`, `releaseYear`, `progress`, `mediaType`, `status`, `collectionOrder` |
| Items per page        | `12`               | 1–200. The next page loads automatically as you scroll down (infinite scroll).         |
| Hide statistics / Add | `false`            | Use these for compact layouts                                                          |

Example: put three instances on one app page, titled "Anime", "Movies" and "Reading", each limited to its own type.

## Hiding form fields per type (no code)

Set **Hidden Form Fields** on a Media Type Config record to a comma-separated list of keys:
`releaseYear`, `platform`, `genre`, `rating`, `startDate`, `completedDate`, `language`, `collection`, `posterUrl`, `notes`, `seasonAiredDate`, `seasonCompletedDate`, `movieAiredDate`.

Anime ships with `releaseYear,platform,startDate,completedDate,collection`. Hidden fields are only hidden in the form: values that already exist are kept, and Apex still fills in dates automatically (e.g. the completed date when an item is marked Completed).

## Adding a new kind of entertainment (no code)

1. Add a value to the **`Media_Item__c.Media_Type__c`** picklist (e.g. `Manga`).
2. _(Optional)_ Add a **Media Type Config** record with `Media_Type__c = Manga`, `Tracks_Progress__c = true`, `Progress_Unit__c = Chapters`, and an icon.

The new type appears in the filter, the form and the stats right away. Without a config record it still works, with default settings: no progress tracking and a generic icon. To hide a type, set `Is_Active__c = false` on its config record.

## Poster images

Poster URLs point to external sites. If posters don't appear, add the image host (e.g. `https://image.tmdb.org`) as a **CSP Trusted Site** with _img-src_ allowed. When an image fails to load, the card shows the media type icon instead.

## Tests

- Apex: `MediaItemServiceTest`, `MediaItemSelectorTest`, `MediaSeasonServiceTest`, `MediaCollectionServiceTest`, `MediaTrackerControllerTest` (shared data comes from `MediaTestDataFactory`). They run as a Standard User with the permission set, so CRUD, FLS and sharing are enforced just as in production.
- LWC Jest: `npm run test:unit`
- **Known quirk:** if you deploy a new object (`Media_Season__c`, `Media_Collection__c`) _and_ run the Apex tests in the same deployment, its tests fail with "sObject type '...' is not supported". The updated permission set does not take effect inside that deployment's own test run. Deploy first, then run the tests (`sf apex run test --test-level RunLocalTests`).
