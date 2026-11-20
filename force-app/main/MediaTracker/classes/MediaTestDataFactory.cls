/**
 * Test data builders shared by all Media Tracker test classes.
 */
@IsTest
public class MediaTestDataFactory {
  public static final String TEST_USER_LAST_NAME = 'MediaTrackerTestUser';

  /** A Standard User with the Media_Tracker_User permission set. */
  public static User createTrackerUser() {
    return createTrackerUser(TEST_USER_LAST_NAME);
  }

  /** Same as createTrackerUser() but with a custom last name, for multi-user tests. */
  public static User createTrackerUser(String lastName) {
    Profile standardProfile = [
      SELECT Id
      FROM Profile
      WHERE Name = 'Standard User'
      LIMIT 1
    ];
    String unique = String.valueOf(Math.abs(Crypto.getRandomLong()));
    User u = new User(
      LastName = lastName,
      Alias = 'mtrack',
      Email = 'mediatracker' + unique + '@example.com',
      Username = 'mediatracker' + unique + '@example.com.test',
      ProfileId = standardProfile.Id,
      TimeZoneSidKey = 'America/Los_Angeles',
      LocaleSidKey = 'en_US',
      EmailEncodingKey = 'UTF-8',
      LanguageLocaleKey = 'en_US'
    );
    insert u;

    PermissionSet ps = [
      SELECT Id
      FROM PermissionSet
      WHERE Name = 'Media_Tracker_User'
      LIMIT 1
    ];
    insert new PermissionSetAssignment(
      AssigneeId = u.Id,
      PermissionSetId = ps.Id
    );
    return u;
  }

  public static User getTrackerUser() {
    return [SELECT Id FROM User WHERE LastName = :TEST_USER_LAST_NAME LIMIT 1];
  }

  public static Media_Item__c buildItem(
    String title,
    String mediaType,
    String status
  ) {
    return new Media_Item__c(
      Name = title,
      Media_Type__c = mediaType,
      Status__c = status,
      Progress_Current__c = 0
    );
  }

  public static MediaItemData buildData(
    String title,
    String mediaType,
    String status
  ) {
    MediaItemData data = new MediaItemData();
    data.title = title;
    data.mediaType = mediaType;
    data.status = status;
    return data;
  }
}
