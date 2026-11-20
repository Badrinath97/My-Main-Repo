/**
 * Data class (DTO) for one child entry of an episodic media item: a season
 * of episodes, or a movie related to the series (Entry_Type__c).
 * A movie is stored as a one-"episode" entry: watched = 1, not watched = 0.
 */
public class MediaSeasonData {
  public static final String TYPE_SEASON = 'Season';
  public static final String TYPE_MOVIE = 'Movie';

  @AuraEnabled
  public Id id { get; set; }
  /** 'Season' or 'Movie'. Blank is treated as Season. */
  @AuraEnabled
  public String entryType { get; set; }
  @AuraEnabled
  public String name { get; set; }
  @AuraEnabled
  public Integer seasonNumber { get; set; }
  /** Episodes in the season; null while still airing / unknown. */
  @AuraEnabled
  public Integer episodeCount { get; set; }
  @AuraEnabled
  public Integer episodesWatched { get; set; }
  @AuraEnabled
  public Boolean isComplete { get; set; }
  /** Season: started airing. Movie: release date. */
  @AuraEnabled
  public Date airedDate { get; set; }
  /** Season: finished airing (blank while airing). Always blank for movies. */
  @AuraEnabled
  public Date completedDate { get; set; }

  public MediaSeasonData() {
    this.episodesWatched = 0;
    this.isComplete = false;
  }

  public MediaSeasonData(Media_Season__c rec) {
    this.id = rec.Id;
    this.entryType = typeOf(rec);
    this.name = rec.Name;
    this.seasonNumber = toInteger(rec.Season_Number__c);
    this.episodeCount = toInteger(rec.Episode_Count__c);
    this.episodesWatched = toInteger(rec.Episodes_Watched__c) ?? 0;
    this.airedDate = rec.Aired_Date__c;
    this.completedDate = rec.Completed_Date__c;
    this.isComplete =
      this.episodeCount != null &&
      this.episodesWatched >= this.episodeCount;
  }

  /**
   * Maps to an SObject for DML. The master-detail field is only set on
   * insert because it is not reparentable (and so not updateable).
   */
  public Media_Season__c toRecord(Id mediaItemId) {
    Boolean movie = isMovie();
    String label = movie ? 'Movie ' : 'Season ';
    Integer watched = this.episodesWatched ?? 0;
    Media_Season__c rec = new Media_Season__c(
      Id = this.id,
      Entry_Type__c = movie ? TYPE_MOVIE : TYPE_SEASON,
      Name = String.isBlank(this.name)
        ? label + this.seasonNumber
        : this.name.trim().left(80),
      Season_Number__c = this.seasonNumber,
      // A movie is a single "episode": watched or not.
      Episode_Count__c = movie ? 1 : this.episodeCount,
      Episodes_Watched__c = movie ? Math.min(1, Math.max(0, watched)) : watched,
      Aired_Date__c = this.airedDate,
      Completed_Date__c = movie ? null : this.completedDate
    );
    if (this.id == null) {
      rec.Media_Item__c = mediaItemId;
    }
    return rec;
  }

  public Boolean isMovie() {
    return this.entryType == TYPE_MOVIE;
  }

  /** Entry type of a record; blank (rows created before movies existed) = Season. */
  public static String typeOf(Media_Season__c rec) {
    return rec.Entry_Type__c == TYPE_MOVIE ? TYPE_MOVIE : TYPE_SEASON;
  }

  /** Only the records of the given entry type, order kept. */
  public static List<Media_Season__c> filterByType(
    List<Media_Season__c> records,
    String entryType
  ) {
    List<Media_Season__c> result = new List<Media_Season__c>();
    for (Media_Season__c rec : records ?? new List<Media_Season__c>()) {
      if (typeOf(rec) == entryType) {
        result.add(rec);
      }
    }
    return result;
  }

  public static List<MediaSeasonData> fromRecords(
    List<Media_Season__c> records
  ) {
    List<MediaSeasonData> result = new List<MediaSeasonData>();
    for (Media_Season__c rec : records ?? new List<Media_Season__c>()) {
      result.add(new MediaSeasonData(rec));
    }
    return result;
  }

  private static Integer toInteger(Decimal value) {
    return value == null ? null : value.intValue();
  }
}
