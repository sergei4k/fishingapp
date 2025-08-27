import React from 'react';
import { View, Image, Text, StyleSheet } from 'react-native';

interface PhotoThumbProps {
  uri: string;
  coordinates: {
    latitude: number;
    longitude: number;
  } | null;
}

const PhotoThumb: React.FC<PhotoThumbProps> = ({ uri, coordinates }) => {
  return (
    <View style={styles.container}>
      <Image source={{ uri }} style={styles.image} />
      {coordinates && (
        <Text style={styles.coordinates}>
          {`Lat: ${coordinates.latitude.toFixed(6)}, Lon: ${coordinates.longitude.toFixed(6)}`}
        </Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    marginBottom: 16,
    alignItems: 'center',
  },
  image: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
  },
  coordinates: {
    color: '#ffffff',
    fontSize: 12,
  },
});

export default PhotoThumb;