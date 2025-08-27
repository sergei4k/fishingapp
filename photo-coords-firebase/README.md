# Photo Coordinates Firebase

This project allows users to upload photos and automatically extracts GPS coordinates from the images' EXIF data. The coordinates, along with the images, are stored in Firebase for easy access and management.

## Features

- Upload photos from the device.
- Extract GPS coordinates from the uploaded photos using EXIF data.
- Store images and their associated coordinates in Firebase.
- View uploaded photos and their coordinates in a user-friendly interface.

## Project Structure

```
photo-coords-firebase
├── .gitignore
├── app.json
├── package.json
├── tsconfig.json
├── README.md
└── src
    ├── App.tsx
    ├── navigation
    │   └── index.tsx
    ├── screens
    │   ├── UploadScreen.tsx
    │   └── ProfileScreen.tsx
    ├── components
    │   ├── ImagePickerButton.tsx
    │   └── PhotoThumb.tsx
    ├── lib
    │   ├── firebase.ts
    │   ├── firebaseHelpers.ts
    │   └── photoExif.ts
    ├── hooks
    │   ├── useAuth.ts
    │   └── usePermissions.ts
    ├── types
    │   └── index.ts
    └── utils
        └── exifParser.ts
```

## Installation

1. Clone the repository:
   ```
   git clone https://github.com/yourusername/photo-coords-firebase.git
   ```

2. Navigate to the project directory:
   ```
   cd photo-coords-firebase
   ```

3. Install the dependencies:
   ```
   npm install
   ```

4. Set up Firebase:
   - Create a Firebase project in the [Firebase Console](https://console.firebase.google.com/).
   - Add your Firebase configuration to `src/lib/firebase.ts`.

## Usage

1. Start the development server:
   ```
   npm start
   ```

2. Open the app on your device or emulator.

3. Use the Upload screen to select and upload photos. The app will extract GPS coordinates and store them in Firebase.

4. Navigate to the Profile screen to view your uploaded photos and their coordinates.

## Contributing

Contributions are welcome! Please open an issue or submit a pull request for any enhancements or bug fixes.

## License

This project is licensed under the MIT License. See the LICENSE file for details.