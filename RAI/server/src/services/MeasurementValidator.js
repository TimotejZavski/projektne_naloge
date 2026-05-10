/**
 * Validator za senzorske podatke.
 *
 * Preveri ali je podatek veljaven in ga očisti.
 * Vrne { isValid: boolean, errors: [], data: {} }
 */

class MeasurementValidator {
  /**
   * Validira GPS podatek
   * @param {Object} data - { latitude, longitude, accuracyMeters? }
   * @returns {Object} { isValid, errors, cleanedData }
   */
  static validateGPS(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { isValid: false, errors: ['GPS data mora biti objekt'], cleanedData: null };
    }

    // Latitude: -90 do 90
    if (data.latitude === undefined || data.latitude === null) {
      errors.push('latitude je obvezen');
    } else if (typeof data.latitude !== 'number') {
      errors.push('latitude mora biti število');
    } else if (data.latitude < -90 || data.latitude > 90) {
      errors.push('latitude mora biti med -90 in 90');
    }

    // Longitude: -180 do 180
    if (data.longitude === undefined || data.longitude === null) {
      errors.push('longitude je obvezen');
    } else if (typeof data.longitude !== 'number') {
      errors.push('longitude mora biti število');
    } else if (data.longitude < -180 || data.longitude > 180) {
      errors.push('longitude mora biti med -180 in 180');
    }

    // Natančnost (opcijsko): mora biti pozitivna in < 1000m (ali je to anomalija)
    if (data.accuracyMeters !== undefined && data.accuracyMeters !== null) {
      if (typeof data.accuracyMeters !== 'number') {
        errors.push('accuracyMeters mora biti število');
      } else if (data.accuracyMeters < 0) {
        errors.push('accuracyMeters mora biti pozitivno');
      } else if (data.accuracyMeters > 500) {
        errors.push('accuracyMeters je prevelik (> 500m) - verjetno napaka');
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, cleanedData: null };
    }

    const cleanedData = {
      latitude: data.latitude,
      longitude: data.longitude,
      accuracyMeters: data.accuracyMeters || null,
    };

    return { isValid: true, errors: [], cleanedData };
  }

  /**
   * Validira accelerometer podatek
   * @param {Object} data - { x, y, z, unit? }
   * @returns {Object} { isValid, errors, cleanedData }
   */
  static validateAccelerometer(data) {
    const errors = [];

    if (!data || typeof data !== 'object') {
      return { isValid: false, errors: ['Accelerometer data mora biti objekt'], cleanedData: null };
    }

    // X, Y, Z osi (običajno so vrednosti med -10 in 10 g, ampak dovolim malo več)
    const axes = ['x', 'y', 'z'];
    for (const axis of axes) {
      if (data[axis] === undefined || data[axis] === null) {
        errors.push(`${axis} je obvezen`);
      } else if (typeof data[axis] !== 'number') {
        errors.push(`${axis} mora biti število`);
      } else if (Math.abs(data[axis]) > 50) {
        // 50g je velika anomalija - verjetno napaka
        errors.push(`${axis} je prevelik (> 50g) - verjetno napaka senzorja`);
      }
    }

    // Unit (opcijsko)
    if (data.unit !== undefined && data.unit !== null) {
      if (typeof data.unit !== 'string') {
        errors.push('unit mora biti string');
      } else if (!['m/s²', 'g', 'other'].includes(data.unit)) {
        errors.push('unit mora biti m/s², g ali other');
      }
    }

    if (errors.length > 0) {
      return { isValid: false, errors, cleanedData: null };
    }

    const cleanedData = {
      x: data.x,
      y: data.y,
      z: data.z,
      unit: data.unit || 'm/s²',
    };

    return { isValid: true, errors: [], cleanedData };
  }

  /**
   * Validira timestamp
   * @param {Date} timestamp
   * @param {number} maxAgeMinutes - koliko minut v preteklosti je OK
   * @returns {Object} { isValid, error? }
   */
  static validateTimestamp(timestamp, maxAgeMinutes = 60) {
    const now = new Date();
    const maxAge = maxAgeMinutes * 60 * 1000; // v ms

    if (!timestamp) {
      return { isValid: false, error: 'timestamp je obvezen' };
    }

    const ts = new Date(timestamp);
    if (isNaN(ts.getTime())) {
      return { isValid: false, error: 'timestamp ni veljaven datum' };
    }

    // Timestamp ne sme biti v prihodnosti
    if (ts > now) {
      return { isValid: false, error: 'timestamp je v prihodnosti' };
    }

    // Timestamp ne sme biti starejši od maxAge
    if (now - ts > maxAge) {
      return { isValid: false, error: `timestamp je star več kot ${maxAgeMinutes} minut` };
    }

    return { isValid: true };
  }

  /**
   * Validira deviceId
   * @param {string} deviceId
   * @returns {Object} { isValid, error? }
   */
  static validateDeviceId(deviceId) {
    const DEVICE_ID_REGEX = /^[a-zA-Z0-9._-]{3,64}$/;

    if (!deviceId || typeof deviceId !== 'string') {
      return { isValid: false, error: 'deviceId mora biti string' };
    }

    if (!DEVICE_ID_REGEX.test(deviceId)) {
      return { isValid: false, error: 'deviceId mora biti 3-64 znakov, samo a-z, A-Z, 0-9, ._-' };
    }

    return { isValid: true };
  }

  /**
   * Validira sensorType
   * @param {string} sensorType
   * @returns {Object} { isValid, error? }
   */
  static validateSensorType(sensorType) {
    const validTypes = ['gps', 'accelerometer'];

    if (!sensorType || typeof sensorType !== 'string') {
      return { isValid: false, error: 'sensorType mora biti string' };
    }

    if (!validTypes.includes(sensorType)) {
      return { isValid: false, error: `sensorType mora biti eno od: ${validTypes.join(', ')}` };
    }

    return { isValid: true };
  }

  /**
   * Glavna validacijska funkcija za měření
   * @param {Object} measurement - { deviceId, sensorType, timestampUtc, data }
   * @returns {Object} { isValid, errors, cleanedData? }
   */
  static validateMeasurement(measurement) {
    const errors = [];

    // Validacija deviceId
    const deviceIdValidation = this.validateDeviceId(measurement.deviceId);
    if (!deviceIdValidation.isValid) {
      errors.push(`deviceId: ${deviceIdValidation.error}`);
    }

    // Validacija sensorType
    const sensorTypeValidation = this.validateSensorType(measurement.sensorType);
    if (!sensorTypeValidation.isValid) {
      errors.push(`sensorType: ${sensorTypeValidation.error}`);
    }

    // Validacija timestamp
    const timestampValidation = this.validateTimestamp(measurement.timestampUtc, 60);
    if (!timestampValidation.isValid) {
      errors.push(`timestamp: ${timestampValidation.error}`);
    }

    if (errors.length > 0) {
      return { isValid: false, errors };
    }

    // Validacija podatkov glede na sensorType
    let sensorValidation;
    if (measurement.sensorType === 'gps') {
      sensorValidation = this.validateGPS(measurement.data);
    } else if (measurement.sensorType === 'accelerometer') {
      sensorValidation = this.validateAccelerometer(measurement.data);
    }

    if (!sensorValidation.isValid) {
      return { isValid: false, errors: sensorValidation.errors };
    }

    return {
      isValid: true,
      errors: [],
      cleanedData: {
        deviceId: measurement.deviceId,
        sensorType: measurement.sensorType,
        timestampUtc: new Date(measurement.timestampUtc),
        data: sensorValidation.cleanedData,
      },
    };
  }
}

module.exports = MeasurementValidator;
