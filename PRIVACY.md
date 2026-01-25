# Privacy Policy for Kivo Time Tracker

**Last Updated: January 25, 2026**

Kivo Time Tracker ("the Extension") is dedicated to protecting your privacy. This Privacy Policy details how we handle data and explains why we require certain permissions to function.

### 1. Data Collection and Usage

Kivo Time Tracker does **not** collect, store, transmit, or sell any personal data to external servers or third parties.

- **Keka Data**: The extension fetches your attendance summary, holiday lists, and leave status directly from the Keka HR portal (`*.keka.com`). This is done solely to calculate and display your work hours, breaks, and project leave times within the extension's popup interface.
- **Authentication**: The extension retrieves your existing Keka access token from your local browser session (via `localStorage`) to authorize these requests. This token is never shared with the developers or any third party.

### 2. Data Storage

All data handled by the extension is stored **locally** on your device:

- **Local Storage**: We use `chrome.storage.local` to save your daily progress, half-day settings, and cached attendance data.
- **Persistence**: This data remains on your machine. If you uninstall the extension, all locally stored data is automatically removed by the browser.

### 3. Third-Party Services

The Extension interacts only with the Keka HR portal. No data is shared with analytics engines, advertising networks, or any other external services.

### 4. Permissions Disclosure

To provide its core functionality, Kivo Time Tracker requires the following permissions:

- **storage**: Required to save your work progress and settings locally.
- **notifications**: Required to send you alerts when you hit your work targets or when it's time for lunch/tea breaks.
- **scripting**: Required to locally retrieve the Keka access token from your active session.
- **alarms**: Required to check your work status in the background every minute for accurate notifications.
- **host_permissions (\*.keka.com)**: Required to allow the extension to communicate with Keka's APIs to fetch your time tracking data.

### 5. Changes to This Policy

We may update this Privacy Policy from time to time. Any changes will be reflected by the "Last Updated" date at the top of this page.

### 6. Contact

If you have any questions or concerns about this Privacy Policy, please reach out via our [GitHub Repository](https://github.com/nisarginfynno/infynno-keka-browser-extension).
