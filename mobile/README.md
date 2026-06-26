# Mezan Employee Mobile

Flutter app for Mezan employees: attendance (QR), payroll, leave & HR feedback, notifications, profile, and floor stock lookup.

## Requirements

- Flutter SDK 3.9+
- Running Mezan API (`/api/v1`)

## API base URL

Override per environment with a compile-time define:

```bash
flutter run --dart-define=API_BASE_URL=https://api.example.com/api/v1
```

Defaults when not set:

| Platform | Default |
|----------|---------|
| Web | `http://localhost:8000/api/v1` |
| Android emulator | `http://10.0.2.2:8000/api/v1` |
| iOS simulator / desktop | `http://127.0.0.1:8000/api/v1` |

## Run

```bash
cd mobile
flutter pub get
flutter run -d chrome --dart-define=API_BASE_URL=http://localhost:8000/api/v1
```

## Tests

```bash
flutter test
flutter analyze
```

See [MANUAL_TEST_CHECKLIST.md](MANUAL_TEST_CHECKLIST.md) before release.

## Security

- Refresh token: `flutter_secure_storage` (encrypted on Android).
- Access token: memory only (not persisted).

## Permissions

- **Camera** — attendance QR and stock barcode scanning (Android `CAMERA`, iOS `NSCameraUsageDescription`).
- **Internet** — API access.

## Branding

- App display name: **Mezan**
- Launch splash (Android): palm green `#003218`
- Replace `mipmap/ic_launcher` and iOS `AppIcon.appiconset` with final brand assets before store release.
