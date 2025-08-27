import React, { useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, Image } from 'react-native';
import { firestore } from '../lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

const ProfileScreen = () => {
  const [photos, setPhotos] = useState([]);

  useEffect(() => {
    const fetchPhotos = async () => {
      const photosCollection = collection(firestore, 'photos');
      const photosSnapshot = await getDocs(photosCollection);
      const photosList = photosSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setPhotos(photosList);
    };

    fetchPhotos();
  }, []);

  const renderItem = ({ item }) => (
    <View style={styles.photoContainer}>
      <Image source={{ uri: item.imageUrl }} style={styles.photo} />
      <Text style={styles.coordinates}>
        Coordinates: {item.coordinates.lat}, {item.coordinates.lon}
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Uploaded Photos</Text>
      <FlatList
        data={photos}
        renderItem={renderItem}
        keyExtractor={item => item.id}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  photoContainer: {
    marginBottom: 16,
    alignItems: 'center',
  },
  photo: {
    width: 100,
    height: 100,
    borderRadius: 8,
    marginBottom: 8,
  },
  coordinates: {
    fontSize: 14,
    color: '#555',
  },
});

export default ProfileScreen;