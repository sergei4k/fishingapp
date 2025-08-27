import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Image, Alert } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { uploadImageAndSaveCoords } from '../lib/firebaseHelpers';
import { extractCoordinates } from '../lib/photoExif';
import Toast from 'react-native-toast-message';

const UploadScreen = () => {
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const pickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 1,
    });

    if (!result.canceled) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleUpload = async () => {
    if (!imageUri) {
      Alert.alert('No image selected', 'Please select an image to upload.');
      return;
    }

    setIsUploading(true);
    try {
      const coordinates = await extractCoordinates(imageUri);
      if (!coordinates) {
        Alert.alert('No coordinates found', 'The selected image does not contain GPS data.');
        return;
      }

      const docId = await uploadImageAndSaveCoords({
        imageUri,
        coordinates,
      });

      Toast.show({
        type: 'success',
        text1: 'Upload successful',
        text2: `Image uploaded with ID: ${docId}`,
      });

      setImageUri(null); // Reset image after upload
    } catch (error) {
      console.error('Upload error:', error);
      Toast.show({
        type: 'error',
        text1: 'Upload failed',
        text2: String(error),
      });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
      <TouchableOpacity onPress={pickImage}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={{ width: 200, height: 200 }} />
        ) : (
          <Text>Select an image</Text>
        )}
      </TouchableOpacity>
      <TouchableOpacity onPress={handleUpload} disabled={isUploading}>
        <Text style={{ marginTop: 20 }}>{isUploading ? 'Uploading...' : 'Upload Image'}</Text>
      </TouchableOpacity>
    </View>
  );
};

export default UploadScreen;