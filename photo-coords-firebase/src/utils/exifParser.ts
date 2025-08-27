import { Image } from 'react-native';
import Exif from 'react-native-exif';

export const getExifData = async (uri: string) => {
  try {
    const exifData = await Exif.getExif(uri);
    return exifData;
  } catch (error) {
    console.error('Error getting EXIF data:', error);
    return null;
  }
};

export const extractCoordinates = (exifData: any) => {
  if (exifData && exifData.GPSLatitude && exifData.GPSLongitude) {
    const latitude = convertToDecimal(exifData.GPSLatitude, exifData.GPSLatitudeRef);
    const longitude = convertToDecimal(exifData.GPSLongitude, exifData.GPSLongitudeRef);
    return { latitude, longitude };
  }
  return null;
};

const convertToDecimal = (coord: any, direction: string) => {
  const degrees = coord[0];
  const minutes = coord[1] / 60;
  const seconds = coord[2] / 3600;
  const decimal = degrees + minutes + seconds;
  return direction === 'S' || direction === 'W' ? decimal * -1 : decimal;
};