# TinyWins — Privacy Policy

**Effective date:** 19 October 2026  
**App publisher / data contact:** [DEVELOPER LEGAL NAME]  
**Privacy contact:** [CONTACT EMAIL]

## 1. Our approach to privacy

TinyWins is a local-first activity-tracking app. You use it to create activities, define rating levels, record daily check-ins, and view insights. **Your activity names, level labels and descriptions, and daily check-in history are kept in the App's local storage on your device; TinyWins does not operate an account system or a cloud database for those records.**

We do use third-party services for analytics, crash diagnostics, performance measurement, and software updates. Those services receive technical and usage information described below. Accordingly, **"local-first" does not mean the App sends no information over the internet**.

This Policy explains what information is handled, why, where it goes, and what you can control.

## 2. Information kept on your device

TinyWins stores the information necessary for its core functionality in a local SQLite database, including:

- Your activities and their names, creation dates, archive status, and settings.
- The rating levels you define, including their labels, descriptions, order, and scores.
- Your dated check-ins and related history used to generate charts.
- Activity archive/restore history, dates, and locally recorded time-zone information used for date calculations.

An earlier version of the App may also have left a legacy migration copy in local AsyncStorage. The App uses that copy for migration and deletes it when you use the full local-data reset.

We do not intentionally transmit the above activity names, descriptions, or complete check-in history to a TinyWins server or include those text fields in our predefined analytics events. The App does not ask you to create an account or provide a name, email address, or phone number to use its core features.

## 3. Usage analytics sent to Google Firebase

TinyWins uses **Google Firebase Analytics** to understand how the App is used and to improve its features. Our own analytics events include activity creation, archiving, restoration and deletion; recording, changing or removing check-ins; opening insights and charts; changing date ranges; backup import/export outcomes; and display-orientation changes.

Our predefined events can include limited details such as counts, selected chart or date-range types, operation results, and the **ordinal position (`level_index`) of a rating selected for a check-in**. This position can indicate which level you selected, but the event does not contain your activity name, your custom level label, or the full activity history.

Firebase Analytics also automatically collects applicable app lifecycle and session events, an app-instance identifier, and device/app information such as platform, operating-system version, and technical context. Google may process network information such as IP addresses and derive approximate geographic information. This is **pseudonymous technical and behavioral information, not necessarily anonymous or only aggregate data**.

## 4. Crash reporting and performance monitoring

We use **Google Firebase Crashlytics** to identify crashes and errors. Reports may contain stack traces, error messages, app state, device details, a Crashlytics installation identifier, and recent analytics-event breadcrumbs. Our own application logs are restricted to predefined messages and approved metadata, but original exception messages and third-party SDK diagnostics may contain details we did not explicitly add.

We use **Google Firebase Performance Monitoring** to measure app startup and screen behavior, rendering, supported network requests, and the duration of selected operations such as loading insights and importing or exporting a backup. Depending on the SDK and platform, performance data can include request URL patterns, timing, payload sizes, device/app information, and CPU or memory metrics.

We use this information to investigate failures, identify slow operations, and improve reliability. We do not use these services to provide advertisements in the current version of TinyWins.

## 5. Software updates, version checks, and website hosting

**Expo Application Services (Expo / 650 Industries, Inc.)** supports software update checks. These requests can transmit app and platform information, runtime/update identifiers, and network or installation-scoped request information needed to deliver updates.

The App also requests a public version configuration file hosted through **GitHub Pages (GitHub, Inc.)** to determine whether an app update is available or required. That request does not intentionally include the activity records described in Section 2, but ordinary web requests may expose an IP address and standard request headers to the hosting provider.

If you open our legal-document pages hosted on GitHub Pages, the hosting provider may similarly process ordinary website-access information. The legal pages themselves are static and do not add their own analytics scripts or advertising trackers.

## 6. Encrypted backup files

You can optionally export your activity data into an encrypted `.tinywins` backup file. TinyWins uses **AES-256-GCM** encryption and derives the key from a password you choose using **PBKDF2-HMAC-SHA256 (600,000 iterations)**. Your backup password is not stored by TinyWins or sent to our servers.

On Android, you select a destination folder. On iOS, the export uses a temporary local file and the operating system's sharing interface. **We do not automatically upload these backup files to a TinyWins-operated server.** If you save or share a backup using a third-party service, its storage and handling of that file are governed by its own practices. Anyone with access to the backup file and its correct password may be able to restore its contents.

Keep the password secure. If it is lost, we cannot recover the exported data for you.

## 7. Android and iOS system backups

TinyWins' Android configuration excludes its SQLite database locations, including the default Expo SQLite folder, from Android cloud backup and device-to-device transfer rules. These exclusions are part of the Android app configuration; other eligible app files may still be handled by Android's backup mechanisms, and earlier device backups may remain. These rules are separate from the encrypted export you initiate yourself.

Platform-level backups on iOS are controlled by Apple and the App's native configuration. The current audit did not independently verify iOS backup exclusions. We therefore do not claim that every form of system backup is disabled on every platform.

## 8. When information is shared and where it may be processed

For the purposes explained above, technical and usage information is processed through **Google Firebase**, **Expo**, and **GitHub Pages**. We do not sell your activity records or operate an advertising-data business. We do not intentionally send your activity names or descriptions to these providers as custom event fields.

These providers may process information in countries other than your country of residence, subject to their security measures and legal requirements. You can read their policies:

- [Google Privacy Policy](https://policies.google.com/privacy)
- [Expo Privacy Policy](https://expo.dev/privacy)
- [GitHub Privacy Statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement)

The operating system, app store, and any storage or sharing destination you choose may process information under their own policies.

## 9. Data security

We use device-local app storage for core records, encryption for user-exported backups, restricted app-defined telemetry fields, and HTTPS connections for supported network services. Firebase and the other providers apply their own service security controls.

No device, application, encryption method, or network service can be guaranteed completely secure. You should secure your phone, protect backup passwords, and choose trusted locations for saved backup files.

## 10. Retention, deletion, and your choices

**On your device:** Activity records remain until you remove them, reset local data, or uninstall the App, subject to platform-specific storage and backup behavior. You can delete an individual activity, clear a check-in, remove archived activities, or use **Profile → Delete all local data**. A full local-data reset clears the App's activity records and its legacy migration payload, but retains a small internal migration flag that prevents deleted legacy records from being re-imported.

**Exported files:** A saved `.tinywins` file remains wherever you chose to store or share it until you delete it there. Deleting local App data does not delete independently saved exports.

**Third-party analytics and diagnostics:** Firebase retains information according to the relevant service's settings, retention periods, and deletion mechanisms. Google Analytics user/event-level retention is configurable, and some aggregated reports can persist independently of those limits; Crashlytics and Performance Monitoring follow their applicable Google retention policies. Uninstalling TinyWins or deleting its local data **does not automatically erase previously collected data from Google's systems**. The App does not currently provide an in-app request to erase historical Firebase Analytics records or reset the Analytics app-instance identifier.

To ask about privacy, access, correction, deletion, or another data right available under applicable law, contact us using the address below. Because TinyWins has no account system and does not know your name or email from normal app use, we may not be able to identify which pseudonymous Firebase records relate to you from your email alone. We will evaluate requests and respond as required by applicable law.

## 11. Children and changes to the App

TinyWins is a general-purpose personal activity tracker, not a service specifically directed to children. If a parent or guardian believes a child has used the App in a way that raises a privacy concern, please contact us. We do not use account registration to verify age. Any additional measures required for younger users or particular jurisdictions must be assessed before the App is offered to those audiences.

If we add accounts, cloud synchronization, advertising, or payments in the future, we will review the resulting data practices and update this Policy as necessary before introducing those features.

## 12. Changes to this policy

We may revise this Policy when TinyWins, third-party services, or legal requirements change. We will publish the revised Policy with an updated effective date and provide additional notice where appropriate or required by law.

## 13. Contact

**Publisher:** [DEVELOPER LEGAL NAME]  
**Privacy contact:** [CONTACT EMAIL]

Please use this contact for questions, concerns, or applicable privacy-rights requests. Our [Terms & Conditions](terms.html) provide additional information about using TinyWins.
