/**
 * Data class (DTO) for a single tracked media item.
 *
 * This is the only shape the UI ever sees or sends: it decouples the LWC
 * from the Media_Item__c field API names, so the schema can evolve without
 * breaking the component contract.
 */
public class MediaItemData {
  @AuraEnabled
  public Id id { get; set; }
  @AuraEnabled
  public String title { get; set; }
  @AuraEnabled
  public String mediaType { get; set; }
  @AuraEnabled
  public String status { get; set; }
  @AuraEnabled
  public Decimal rating { get; set; }
  @AuraEnabled
  public String genre { get; set; }
  @AuraEnabled
  public String platform { get; set; }
  @AuraEnabled
  public Integer releaseYear { get; set; }
  @AuraEnabled
  public Integer progressCurrent { get; set; }
  @AuraEnabled
  public Integer progressTotal { get; set; }
  @AuraEnabled
  public Integer progressPercent { get; set; }
  @AuraEnabled
  public Date startDate { get; set; }
  @AuraEnabled
  public Date completedDate { get; set; }
  @AuraEnabled
  public Boolean isFavorite { get; set; }
  @AuraEnabled
  public String posterUrl { get; set; }
  @AuraEnabled
  public String notes { get; set; }
  @AuraEnabled
  public Datetime lastModifiedDate { get; set; }
  /**
   * Seasons ordered by number. When saving: null = leave seasons untouched,
   * a list (even empty) = replace the item's seasons with exactly this list.
   */
  @AuraEnabled
  public List<MediaSeasonData> seasons { get; set; }
  /** The season being watched now: first unfinished season, else the last one. */
  @AuraEnabled
  public Integer currentSeasonNumber { get; set; }

  public MediaItemData() {
    this.isFavorite = false;
    this.progressCurrent = 0;
  }

  public MediaItemData(Media_Item__c rec) {
    this.id = rec.Id;
    this.title = rec.Name;
    this.mediaType = rec.Media_Type__c;
    this.status = rec.Status__c;
    this.rating = rec.Rating__c;
    this.genre = rec.Genre__c;
    this.platform = rec.Platform__c;
    this.releaseYear = toInteger(rec.Release_Year__c);
    this.progressCurrent = toInteger(rec.Progress_Current__c);
    this.progressTotal = toInteger(rec.Progress_Total__c);
    this.startDate = rec.Start_Date__c;
    this.completedDate = rec.Completed_Date__c;
    this.isFavorite = rec.Is_Favorite__c == true;
    this.posterUrl = rec.Poster_URL__c;
    this.notes = rec.Notes__c;
    this.lastModifiedDate = rec.LastModifiedDate;
    this.progressPercent = calculatePercent();
    this.seasons = MediaSeasonData.fromRecords(rec.Media_Seasons__r);
    this.currentSeasonNumber = findCurrentSeasonNumber();
  }

  /** Maps the DTO back to an SObject ready for DML (Id included when present). */
  public Media_Item__c toRecord() {
    return new Media_Item__c(
      Id = this.id,
      Name = this.title?.trim(),
      Media_Type__c = this.mediaType,
      Status__c = this.status,
      Rating__c = this.rating,
      Genre__c = this.genre,
      Platform__c = this.platform,
      Release_Year__c = this.releaseYear,
      Progress_Current__c = this.progressCurrent,
      Progress_Total__c = this.progressTotal,
      Start_Date__c = this.startDate,
      Completed_Date__c = this.completedDate,
      Is_Favorite__c = this.isFavorite == true,
      Poster_URL__c = this.posterUrl,
      Notes__c = this.notes
    );
  }

  public static List<MediaItemData> fromRecords(List<Media_Item__c> records) {
    List<MediaItemData> result = new List<MediaItemData>();
    for (Media_Item__c rec : records) {
      result.add(new MediaItemData(rec));
    }
    return result;
  }

  private Integer calculatePercent() {
    if (this.status == MediaItemService.STATUS_COMPLETED) {
      return 100;
    }
    if (this.progressTotal == null || this.progressTotal <= 0) {
      return 0;
    }
    Decimal pct =
      (Decimal.valueOf(this.progressCurrent ?? 0) / this.progressTotal) * 100;
    return Math.min(100, pct.round(System.RoundingMode.HALF_UP).intValue());
  }

  private Integer findCurrentSeasonNumber() {
    if (this.seasons.isEmpty()) {
      return null;
    }
    for (MediaSeasonData season : this.seasons) {
      if (!season.isComplete) {
        return season.seasonNumber;
      }
    }
    return this.seasons[this.seasons.size() - 1].seasonNumber;
  }

  private static Integer toInteger(Decimal value) {
    return value == null ? null : value.intValue();
  }
}
