/**
 * Data class (DTO) for one season of an episodic media item.
 */
public class MediaSeasonData {
  @AuraEnabled
  public Id id { get; set; }
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

  public MediaSeasonData() {
    this.episodesWatched = 0;
    this.isComplete = false;
  }

  public MediaSeasonData(Media_Season__c rec) {
    this.id = rec.Id;
    this.name = rec.Name;
    this.seasonNumber = toInteger(rec.Season_Number__c);
    this.episodeCount = toInteger(rec.Episode_Count__c);
    this.episodesWatched = toInteger(rec.Episodes_Watched__c) ?? 0;
    this.isComplete =
      this.episodeCount != null &&
      this.episodesWatched >= this.episodeCount;
  }

  /**
   * Maps to an SObject for DML. The master-detail field is only set on
   * insert because it is not reparentable (and so not updateable).
   */
  public Media_Season__c toRecord(Id mediaItemId) {
    Media_Season__c rec = new Media_Season__c(
      Id = this.id,
      Name = String.isBlank(this.name)
        ? 'Season ' + this.seasonNumber
        : this.name.trim(),
      Season_Number__c = this.seasonNumber,
      Episode_Count__c = this.episodeCount,
      Episodes_Watched__c = this.episodesWatched ?? 0
    );
    if (this.id == null) {
      rec.Media_Item__c = mediaItemId;
    }
    return rec;
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
