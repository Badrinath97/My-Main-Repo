/**
 * Data class describing how one kind of entertainment behaves in the UI
 * (label, icon, whether progress is tracked and in what unit).
 * Built from the Media_Type__c picklist merged with Media_Type_Config__mdt.
 */
public class MediaTypeConfigData {
  public static final String DEFAULT_ICON = 'utility:open_folder';

  @AuraEnabled
  public String value { get; set; }
  @AuraEnabled
  public String label { get; set; }
  @AuraEnabled
  public String iconName { get; set; }
  @AuraEnabled
  public Boolean tracksProgress { get; set; }
  @AuraEnabled
  public String progressUnit { get; set; }
  @AuraEnabled
  public Integer sortOrder { get; set; }
  /** Items of this type can be split into seasons with per-season episode counts. */
  @AuraEnabled
  public Boolean tracksSeasons { get; set; }
  /** Items of this type can list related movies (e.g. an anime's films). */
  @AuraEnabled
  public Boolean tracksMovies { get; set; }
  /** Form fields to hide for this type, e.g. ['releaseYear', 'platform']. */
  @AuraEnabled
  public List<String> hiddenFields { get; set; }
  /** Optional form fields shown only for this type, e.g. ['airedDate']. */
  @AuraEnabled
  public List<String> extraFields { get; set; }

  public MediaTypeConfigData(String value, String label) {
    this.value = value;
    this.label = label;
    this.iconName = DEFAULT_ICON;
    this.tracksProgress = false;
    this.tracksSeasons = false;
    this.tracksMovies = false;
    this.hiddenFields = new List<String>();
    this.extraFields = new List<String>();
    this.sortOrder = 999;
  }

  public MediaTypeConfigData applyConfig(Media_Type_Config__mdt config) {
    if (config == null) {
      return this;
    }
    this.iconName = String.isBlank(config.Icon_Name__c)
      ? DEFAULT_ICON
      : config.Icon_Name__c;
    this.tracksProgress = config.Tracks_Progress__c == true;
    this.progressUnit = config.Progress_Unit__c;
    // Seasons only make sense on top of progress tracking.
    this.tracksSeasons =
      this.tracksProgress && config.Tracks_Seasons__c == true;
    this.tracksMovies = config.Tracks_Movies__c == true;
    this.hiddenFields = parseList(config.Hidden_Form_Fields__c);
    this.extraFields = parseList(config.Extra_Form_Fields__c);
    this.sortOrder = config.Sort_Order__c == null
      ? 999
      : config.Sort_Order__c.intValue();
    return this;
  }

  /** "releaseYear, platform,," -> ['releaseYear', 'platform'] */
  @TestVisible
  private static List<String> parseList(String value) {
    List<String> result = new List<String>();
    if (String.isBlank(value)) {
      return result;
    }
    for (String part : value.split(',')) {
      if (String.isNotBlank(part)) {
        result.add(part.trim());
      }
    }
    return result;
  }
}
