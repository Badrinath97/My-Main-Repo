@IsTest
private class MediaSeasonServiceTest {
  @TestSetup
  static void setup() {
    MediaTestDataFactory.createTrackerUser();
  }

  private static MediaSeasonData season(
    Integer seasonNumber,
    Integer episodeCount,
    Integer episodesWatched
  ) {
    MediaSeasonData data = new MediaSeasonData();
    data.seasonNumber = seasonNumber;
    data.episodeCount = episodeCount;
    data.episodesWatched = episodesWatched;
    return data;
  }

  private static MediaItemData saveSeries(
    String status,
    List<MediaSeasonData> seasons
  ) {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Dark',
      'TV Series',
      status
    );
    input.seasons = seasons;
    return MediaItemService.saveMediaItem(input);
  }

  @IsTest
  static void overallProgressIsCalculatedFromSeasons() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaSeasonData named = season(2, 8, 3);
      named.name = '  Shippuden ';
      MediaItemData saved = saveSeries(
        'Planned',
        new List<MediaSeasonData>{ season(1, 10, 10), named }
      );

      Assert.areEqual(
        'Shippuden',
        saved.seasons[1].name,
        'Optional season name is kept'
      );
      Assert.areEqual(13, saved.progressCurrent);
      Assert.areEqual(18, saved.progressTotal);
      Assert.areEqual(72, saved.progressPercent);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, saved.status);
      Assert.areEqual(2, saved.seasons.size());
      Assert.isTrue(saved.seasons[0].isComplete);
      Assert.areEqual('Season 1', saved.seasons[0].name);
      Assert.areEqual(2, saved.currentSeasonNumber);
    }
  }

  @IsTest
  static void plusOneCrossesSeasonBoundariesAndCompletes() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 2, 1), season(2, 2, 0) }
      );

      MediaItemData step1 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(2, step1.seasons[0].episodesWatched);
      Assert.areEqual(2, step1.currentSeasonNumber, 'Season 1 finished');

      MediaItemData step2 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(1, step2.seasons[1].episodesWatched);
      Assert.areEqual(3, step2.progressCurrent);

      MediaItemData step3 = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, step3.status);
      Assert.areEqual(Date.today(), step3.completedDate);

      MediaItemData atEnd = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(4, atEnd.progressCurrent, 'Nothing past the end');

      MediaItemData back = MediaItemService.incrementProgress(saved.id, -1);
      Assert.areEqual(1, back.seasons[1].episodesWatched);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, back.status);
      Assert.isNull(back.completedDate);
    }
  }

  @IsTest
  static void unknownEpisodeCountLeavesTotalBlank() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 10, 10), season(2, null, 4) }
      );
      Assert.areEqual(14, saved.progressCurrent);
      Assert.isNull(saved.progressTotal, 'Season 2 is still airing');

      MediaItemData next = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(5, next.seasons[1].episodesWatched);
      Assert.areEqual(MediaItemService.STATUS_IN_PROGRESS, next.status);
    }
  }

  @IsTest
  static void markingCompletedFillsEverySeason() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'Completed',
        new List<MediaSeasonData>{ season(1, 5, 0), season(2, 6, 2) }
      );
      Assert.areEqual(11, saved.progressCurrent);
      Assert.areEqual(11, saved.progressTotal);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, saved.status);
      Assert.isTrue(saved.seasons[1].isComplete);
    }
  }

  @IsTest
  static void savingReplacesSeasonsAndNullLeavesThemAlone() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveSeries(
        'In Progress',
        new List<MediaSeasonData>{ season(1, 10, 2), season(2, 8, 0) }
      );

      saved.seasons.remove(1);
      saved.seasons[0].episodeCount = 12;
      MediaItemData trimmed = MediaItemService.saveMediaItem(saved);
      Assert.areEqual(1, trimmed.seasons.size());
      Assert.areEqual(12, trimmed.progressTotal);

      trimmed.seasons = null; // e.g. a caller that does not know about seasons
      trimmed.genre = 'Sci-Fi';
      MediaItemData untouched = MediaItemService.saveMediaItem(trimmed);
      Assert.areEqual(1, untouched.seasons.size());
    }
  }

  @IsTest
  static void editingSeasonRecordsDirectlyKeepsItemInSync() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData item = saveSeries('Planned', new List<MediaSeasonData>());

      Media_Season__c s1 = new Media_Season__c(
        Media_Item__c = item.id,
        Name = 'Season 1',
        Season_Number__c = 1,
        Episode_Count__c = 6,
        Episodes_Watched__c = 6
      );
      insert s1; // as if created on the record page

      MediaItemData afterInsert = MediaItemService.getMediaItem(item.id);
      Assert.areEqual(6, afterInsert.progressTotal);
      Assert.areEqual(MediaItemService.STATUS_COMPLETED, afterInsert.status);

      delete s1;
      MediaItemData afterDelete = MediaItemService.getMediaItem(item.id);
      Assert.areEqual(
        6,
        afterDelete.progressTotal,
        'With no seasons left the item keeps its last values'
      );
    }
  }

  @IsTest
  static void invalidSeasonListsAreRejected() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      assertSaveFails(
        new List<MediaSeasonData>{ season(1, 5, 0), season(1, 5, 0) },
        'Season 1 is listed more than once.'
      );
      assertSaveFails(
        new List<MediaSeasonData>{ season(null, 5, 0) },
        'Each season needs a season number of 0 or more.'
      );

      MediaSeasonData foreign = season(1, 5, 0);
      foreign.id = MediaItemService.saveMediaItem(
          withSeasons(new List<MediaSeasonData>{ season(1, 3, 0) })
        )
        .seasons[0]
        .id;
      try {
        MediaItemService.saveMediaItem(
          withSeasons(new List<MediaSeasonData>{ foreign })
        );
        Assert.fail('Expected a season from another item to be rejected');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.isTrue(e.getMessage().contains('does not belong'));
      }
    }
  }

  @IsTest
  static void typesWithoutSeasonsIgnoreSeasonData() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData movie = MediaTestDataFactory.buildData(
        'Inception',
        'Movie',
        'Planned'
      );
      movie.seasons = new List<MediaSeasonData>{ season(1, 1, 0) };
      MediaItemData saved = MediaItemService.saveMediaItem(movie);
      Assert.isTrue(saved.seasons.isEmpty());
    }
  }

  @IsTest
  static void decrementingACompletedItemReopensIt() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData input = MediaTestDataFactory.buildData(
        'Arcane',
        'Anime',
        'Completed'
      );
      input.progressTotal = 1;
      MediaItemData saved = MediaItemService.saveMediaItem(input);
      Assert.areEqual(1, saved.progressCurrent);

      MediaItemData reopened = MediaItemService.incrementProgress(saved.id, -1);
      Assert.areEqual(0, reopened.progressCurrent);
      Assert.areEqual(MediaItemService.STATUS_PLANNED, reopened.status);
    }
  }

  @IsTest
  static void typeConfigExposesSeasonFlag() {
    Boolean seriesTracksSeasons = false;
    Boolean movieTracksSeasons = true;
    for (MediaTypeConfigData config : MediaItemService.getTypeConfigs()) {
      if (config.value == 'TV Series') {
        seriesTracksSeasons = config.tracksSeasons;
      } else if (config.value == 'Movie') {
        movieTracksSeasons = config.tracksSeasons;
      }
    }
    Assert.isTrue(seriesTracksSeasons);
    Assert.isFalse(movieTracksSeasons);
  }

  // ------------------------------------------------------------------ movies

  private static MediaSeasonData movie(String title, Boolean watched) {
    MediaSeasonData data = new MediaSeasonData();
    data.name = title;
    data.episodesWatched = watched ? 1 : 0;
    return data;
  }

  private static MediaItemData saveAnime(
    String status,
    List<MediaSeasonData> seasons,
    List<MediaSeasonData> movies
  ) {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Demon Slayer',
      'Anime',
      status
    );
    input.seasons = seasons;
    input.movies = movies;
    return MediaItemService.saveMediaItem(input);
  }

  @IsTest
  static void moviesAreSavedSeparatelyAndDoNotCountAsEpisodes() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveAnime(
        'Planned',
        new List<MediaSeasonData>{ season(1, 26, 26), season(2, 18, 0) },
        new List<MediaSeasonData>{
          movie(' Mugen Train ', true),
          movie('Infinity Castle', false)
        }
      );

      Assert.areEqual(2, saved.seasons.size(), 'Movies are not seasons');
      Assert.areEqual(2, saved.movies.size());
      Assert.areEqual('Mugen Train', saved.movies[0].name);
      Assert.areEqual(1, saved.movies[0].seasonNumber, 'Numbered by position');
      Assert.areEqual(2, saved.movies[1].seasonNumber);
      Assert.isTrue(saved.movies[0].isComplete);
      Assert.isFalse(saved.movies[1].isComplete);
      Assert.areEqual(MediaSeasonData.TYPE_MOVIE, saved.movies[0].entryType);
      Assert.areEqual(26, saved.progressCurrent, 'Only episodes count');
      Assert.areEqual(44, saved.progressTotal);

      // +1 steps through episodes and never touches the movies.
      MediaItemData stepped = MediaItemService.incrementProgress(saved.id, 1);
      Assert.areEqual(1, stepped.seasons[1].episodesWatched);
      Assert.isFalse(stepped.movies[1].isComplete);

      // Sending only seasons leaves the movies alone, and vice versa.
      stepped.movies = null;
      MediaItemData seasonsOnly = MediaItemService.saveMediaItem(stepped);
      Assert.areEqual(2, seasonsOnly.movies.size());

      seasonsOnly.seasons = null;
      seasonsOnly.movies = new List<MediaSeasonData>{ seasonsOnly.movies[1] };
      MediaItemData oneMovie = MediaItemService.saveMediaItem(seasonsOnly);
      Assert.areEqual(1, oneMovie.movies.size());
      Assert.areEqual('Infinity Castle', oneMovie.movies[0].name);
      Assert.areEqual(1, oneMovie.movies[0].seasonNumber, 'Renumbered');
      Assert.areEqual(2, oneMovie.seasons.size());
    }
  }

  @IsTest
  static void completingMarksMoviesWatchedAndItemWithOnlyMoviesKeepsProgress() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData completed = saveAnime(
        'Completed',
        new List<MediaSeasonData>{ season(1, 12, 0) },
        new List<MediaSeasonData>{ movie('The Movie', false) }
      );
      Assert.isTrue(completed.movies[0].isComplete);
      Assert.areEqual(12, completed.progressCurrent);

      MediaItemData input = MediaTestDataFactory.buildData(
        'Your Name Universe',
        'Anime',
        'In Progress'
      );
      input.progressCurrent = 3;
      input.progressTotal = 10;
      input.movies = new List<MediaSeasonData>{ movie('Film', true) };
      MediaItemData onlyMovies = MediaItemService.saveMediaItem(input);
      Assert.areEqual(
        3,
        onlyMovies.progressCurrent,
        'Movies do not drive progress'
      );
      Assert.areEqual(10, onlyMovies.progressTotal);
      Assert.isTrue(onlyMovies.seasons.isEmpty());
    }
  }

  @IsTest
  static void invalidMoviesAreRejected() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaItemData saved = saveAnime(
        'Planned',
        new List<MediaSeasonData>{ season(1, 12, 0) },
        new List<MediaSeasonData>()
      );
      saved.movies = new List<MediaSeasonData>{ movie('  ', false) };
      try {
        MediaItemService.saveMediaItem(saved);
        Assert.fail('Expected an exception');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.areEqual('Each movie needs a title.', e.getMessage());
      }

      // A season's id can't be passed off as a movie.
      MediaSeasonData impostor = movie('Impostor', false);
      impostor.id = saved.seasons[0].id;
      saved.movies = new List<MediaSeasonData>{ impostor };
      try {
        MediaItemService.saveMediaItem(saved);
        Assert.fail('Expected an exception');
      } catch (MediaItemService.MediaServiceException e) {
        Assert.isTrue(e.getMessage().contains('does not belong'));
      }
    }
  }

  @IsTest
  static void seasonsAndMoviesKeepTheirAiringDates() {
    System.runAs(MediaTestDataFactory.getTrackerUser()) {
      MediaSeasonData s1 = season(1, 220, 220);
      s1.airedDate = Date.newInstance(2002, 10, 3);
      s1.completedDate = Date.newInstance(2007, 2, 8);
      MediaSeasonData film = movie('Ninja Clash in the Land of Snow', false);
      film.airedDate = Date.newInstance(2004, 8, 21);
      film.completedDate = Date.newInstance(2004, 8, 22); // ignored for movies

      MediaItemData saved = saveAnime(
        'In Progress',
        new List<MediaSeasonData>{ s1 },
        new List<MediaSeasonData>{ film }
      );

      Assert.areEqual(
        Date.newInstance(2002, 10, 3),
        saved.seasons[0].airedDate
      );
      Assert.areEqual(
        Date.newInstance(2007, 2, 8),
        saved.seasons[0].completedDate
      );
      Assert.areEqual(Date.newInstance(2004, 8, 21), saved.movies[0].airedDate);
      Assert.isNull(
        saved.movies[0].completedDate,
        'Movies have no completed date'
      );

      MediaSeasonData backwards = season(2, 10, 0);
      backwards.airedDate = Date.newInstance(2010, 1, 1);
      backwards.completedDate = Date.newInstance(2009, 1, 1);
      saved.seasons.add(backwards);
      saved.movies = null;
      try {
        MediaItemService.saveMediaItem(saved);
        Assert.fail('Expected the Completed_After_Aired validation rule');
      } catch (DmlException e) {
        Assert.isTrue(e.getMessage().contains('before the aired date'));
      }
    }
  }

  @IsTest
  static void animeHidesFieldsThroughConfig() {
    Map<String, MediaTypeConfigData> configs = new Map<String, MediaTypeConfigData>();
    for (MediaTypeConfigData config : MediaItemService.getTypeConfigs()) {
      configs.put(config.value, config);
    }
    List<String> hidden = configs.get('Anime').hiddenFields;
    for (
      String field : new List<String>{
        'releaseYear',
        'platform',
        'startDate',
        'completedDate',
        'collection'
      }
    ) {
      Assert.isTrue(hidden.contains(field), 'Anime hides ' + field);
    }
    Assert.isFalse(hidden.contains('posterUrl'), 'Anime shows the poster URL');
    Assert.isTrue(configs.get('Movie').hiddenFields.isEmpty());
    Assert.areEqual(
      new List<String>{ 'a', 'b' },
      MediaTypeConfigData.parseList(' a, ,b,')
    );
  }

  @IsTest
  static void typeConfigExposesMovieFlag() {
    Map<String, Boolean> tracksMovies = new Map<String, Boolean>();
    for (MediaTypeConfigData config : MediaItemService.getTypeConfigs()) {
      tracksMovies.put(config.value, config.tracksMovies);
    }
    Assert.isTrue(tracksMovies.get('Anime'));
    Assert.isTrue(tracksMovies.get('TV Series'));
    Assert.isFalse(tracksMovies.get('Movie'));
  }

  private static MediaItemData withSeasons(List<MediaSeasonData> seasons) {
    MediaItemData input = MediaTestDataFactory.buildData(
      'Severance',
      'TV Series',
      'Planned'
    );
    input.seasons = seasons;
    return input;
  }

  private static void assertSaveFails(
    List<MediaSeasonData> seasons,
    String expectedMessage
  ) {
    try {
      MediaItemService.saveMediaItem(withSeasons(seasons));
      Assert.fail('Expected: ' + expectedMessage);
    } catch (MediaItemService.MediaServiceException e) {
      Assert.areEqual(expectedMessage, e.getMessage());
    }
  }
}
