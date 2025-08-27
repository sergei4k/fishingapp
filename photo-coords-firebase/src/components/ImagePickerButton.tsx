import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { usePermissions } from '../hooks/usePermissions';
import { extractCoordinates } from '../lib/photoExif';
import { uploadImageAndSaveCoords } from '../lib/firebaseHelpers';

const ImagePickerButton = () => {
  const { requestPermission } = usePermissions();

  const handleImagePick = async () => {
    const permission = await requestPermission();
    if (!permission) return;

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const uri = result.assets[0].uri;
      const coordinates = await extractCoordinates(uri);
      await uploadImageAndSaveCoords(uri, coordinates);
    }
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handleImagePick}>
      <Text style={styles.buttonText}>Select Image</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#0ea5e9',
    padding: 10,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonText: {
    color: '#ffffff',
    fontWeight: 'bold',
  },
});

export default ImagePickerButton;