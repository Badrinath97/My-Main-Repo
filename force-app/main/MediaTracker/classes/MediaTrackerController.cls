/**
 * Thin @AuraEnabled facade for the mediaTracker LWC.
 * No business logic here: delegate to MediaItemService and translate
 * exceptions into user-friendly AuraHandledExceptions.
 */
public with sharing class MediaTrackerController {
  @AuraEnabled(cacheable=true)
  public static List<MediaTypeConfigData> getTypeConfigs() {
    try {
      return MediaItemService.getTypeConfigs();
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static MediaPageData getMediaItems(MediaFilterData filter) {
    try {
      return MediaItemService.getMediaPage(filter);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static MediaStatsData getStats(List<String> mediaTypes) {
    try {
      return MediaItemService.getStats(mediaTypes);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static MediaItemData saveMediaItem(MediaItemData item) {
    try {
      return MediaItemService.saveMediaItem(item);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static MediaItemData incrementProgress(Id recordId, Integer step) {
    try {
      return MediaItemService.incrementProgress(recordId, step);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static MediaItemData toggleFavorite(Id recordId) {
    try {
      return MediaItemService.toggleFavorite(recordId);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @AuraEnabled
  public static void deleteMediaItem(Id recordId) {
    try {
      MediaItemService.deleteMediaItem(recordId);
    } catch (Exception e) {
      throw toAuraException(e);
    }
  }

  @TestVisible
  private static AuraHandledException toAuraException(Exception e) {
    String message = e instanceof DmlException
      ? ((DmlException) e).getDmlMessage(0)
      : e.getMessage();
    AuraHandledException auraException = new AuraHandledException(message);
    auraException.setMessage(message); // so the message is visible in tests/logs too
    return auraException;
  }
}
