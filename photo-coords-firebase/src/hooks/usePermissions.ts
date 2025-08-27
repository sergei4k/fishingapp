import { useEffect, useState } from 'react';
import { Alert, PermissionsAndroid, Platform } from 'react-native';

const usePermissions = () => {
  const [cameraPermission, setCameraPermission] = useState<boolean>(false);
  const [photoLibraryPermission, setPhotoLibraryPermission] = useState<boolean>(false);

  useEffect(() => {
    const requestPermissions = async () => {
      if (Platform.OS === 'android') {
        const cameraGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.CAMERA,
          {
            title: 'Camera Permission',
            message: 'This app needs access to your camera to take photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        const photoLibraryGranted = await PermissionsAndroid.request(
          PermissionsAndroid.PERMISSIONS.READ_EXTERNAL_STORAGE,
          {
            title: 'Photo Library Permission',
            message: 'This app needs access to your photo library to upload photos.',
            buttonNeutral: 'Ask Me Later',
            buttonNegative: 'Cancel',
            buttonPositive: 'OK',
          }
        );

        setCameraPermission(cameraGranted === PermissionsAndroid.RESULTS.GRANTED);
        setPhotoLibraryPermission(photoLibraryGranted === PermissionsAndroid.RESULTS.GRANTED);
      } else {
        // For iOS, permissions are handled differently
        // You can use a library like 'react-native-permissions' for better handling
        // Here we assume permissions are granted for simplicity
        setCameraPermission(true);
        setPhotoLibraryPermission(true);
      }
    };

    requestPermissions();
  }, []);

  return { cameraPermission, photoLibraryPermission };
};

export default usePermissions;