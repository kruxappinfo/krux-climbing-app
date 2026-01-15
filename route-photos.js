// Route Photo Management Module
// Handles uploading and retrieving photos for climbing routes

/**
 * Check if current user has permission to upload photos
 * @returns {Promise<boolean>}
 */
async function canUploadPhotos() {
    if (!currentUser) return false;

    try {
        const adminDoc = await db.collection('admins').doc(currentUser.uid).get();
        if (!adminDoc.exists) return false;

        const role = adminDoc.data().role;
        return role === 'photo_uploader' || role === 'admin';
    } catch (error) {
        console.error('Error checking upload permissions:', error);
        return false;
    }
}

/**
 * Check if current user is a photo admin (can manage uploaders)
 * @returns {Promise<boolean>}
 */
async function isPhotoAdmin() {
    if (!currentUser) return false;

    try {
        const adminDoc = await db.collection('admins').doc(currentUser.uid).get();
        if (!adminDoc.exists) return false;

        return adminDoc.data().role === 'admin';
    } catch (error) {
        console.error('Error checking admin permissions:', error);
        return false;
    }
}

/**
 * Get all photos for a route
 * @param {string} schoolId - School identifier
 * @param {string} routeName - Route name
 * @returns {Promise<Array>} - Array of photo objects {id, url, uploadedBy, ...}
 */
async function getRoutePhotos(schoolId, routeName) {
    try {
        const snapshot = await db.collection('route-photos')
            .where('schoolId', '==', schoolId)
            .where('routeName', '==', routeName)
            .get({ source: 'server' }); // Force server fetch to avoid stale cache

        if (snapshot.empty) {
            return [];
        }

        const photos = snapshot.docs.map(doc => ({
            id: doc.id,
            url: doc.data().photoUrl,
            uploadedBy: doc.data().uploadedBy,
            uploadedByName: doc.data().uploadedByName,
            uploadedAt: doc.data().uploadedAt
        }));

        // Sort in memory to avoid Firestore composite index requirement
        return photos.sort((a, b) => {
            const tA = a.uploadedAt ? a.uploadedAt.toMillis() : 0;
            const tB = b.uploadedAt ? b.uploadedAt.toMillis() : 0;
            return tB - tA; // Descending
        });

    } catch (error) {
        console.error('Error getting route photos:', error);
        return [];
    }
}

/**
 * Upload a photo for a route
 * @param {string} schoolId - School identifier
 * @param {string} routeName - Route name
 * @param {File} file - Image file to upload
 * @returns {Promise<string>} - URL of uploaded photo
 */
async function uploadRoutePhoto(schoolId, routeName, file) {
    if (!currentUser) {
        throw new Error('User must be logged in to upload photos');
    }

    // Check upload permissions
    const hasPermission = await canUploadPhotos();
    if (!hasPermission) {
        throw new Error('You do not have permission to upload photos. Contact the administrator for access.');
    }

    // Validate file type
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/jpg'];
    if (!validTypes.includes(file.type)) {
        throw new Error('Invalid file type. Please upload a JPG, PNG, or WebP image.');
    }

    // Validate file size (max 5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
        throw new Error('File too large. Maximum size is 5MB.');
    }

    try {
        // Create unique filename with timestamp
        const timestamp = Date.now();
        const sanitizedRouteName = routeName.replace(/[^a-zA-Z0-9]/g, '_');
        const extension = file.name.split('.').pop();
        const filename = `${timestamp}_${sanitizedRouteName}.${extension}`;

        // Create storage reference
        const storageRef = storage.ref();
        const photoRef = storageRef.child(`route-photos/${schoolId}/${filename}`);

        // Upload file
        const uploadTask = await photoRef.put(file);

        // Get download URL
        const photoUrl = await uploadTask.ref.getDownloadURL();

        // Save metadata to Firestore with UNIQUE ID
        const docId = `${schoolId}_${sanitizedRouteName}_${timestamp}`;
        await db.collection('route-photos').doc(docId).set({
            photoUrl: photoUrl,
            uploadedBy: currentUser.uid,
            uploadedByName: currentUser.displayName || 'Anonymous',
            uploadedAt: firebase.firestore.FieldValue.serverTimestamp(),
            routeName: routeName,
            schoolId: schoolId,
            filename: filename
        });

        return photoUrl;

    } catch (error) {
        console.error('Error uploading photo:', error);

        // Check for likely CORS or Network error
        if (error.code === 'storage/retry-limit-exceeded' || error.message.includes('network') || !error.code) {
            throw new Error('Error de conexión o CORS. Si estás en localhost, instala la extensión "Allow CORS" en Chrome.');
        }

        throw error;
    }
}

/**
 * Get photo URL for a route (Legacy - returns first found)
 * @param {string} schoolId - School identifier
 * @param {string} routeName - Route name
 * @returns {Promise<string|null>} - Photo URL or null if not found
 */
async function getRoutePhotoURL(schoolId, routeName) {
    const photos = await getRoutePhotos(schoolId, routeName);
    return photos.length > 0 ? photos[0].url : null;
}

/**
 * Delete a route photo
 * @param {string} photoId - Firestore document ID of the photo
 * @param {string} uploaderUid - UID of the user who uploaded the photo (for quick check)
 * @returns {Promise<boolean>} - Success status
 */
async function deleteRoutePhoto(photoId, uploaderUid) {
    if (!currentUser) {
        throw new Error('User must be logged in to delete photos');
    }

    try {
        // Get photo metadata first to get filename for Storage deletion
        const doc = await db.collection('route-photos').doc(photoId).get();

        if (!doc.exists) {
            throw new Error('Photo not found');
        }

        const photoData = doc.data();

        // Check if user is the uploader or admin
        const isAdmin = await isPhotoAdmin();

        if (photoData.uploadedBy !== currentUser.uid && !isAdmin) {
            throw new Error('You do not have permission to delete this photo');
        }

        // Delete from Storage
        if (photoData.filename && photoData.schoolId) {
            const storageRef = storage.ref();
            const photoRef = storageRef.child(`route-photos/${photoData.schoolId}/${photoData.filename}`);
            await photoRef.delete().catch(() => {
                // File might not exist in storage
            });
        }

        // Delete from Firestore
        await db.collection('route-photos').doc(photoId).delete();

        // Verify deletion
        const check = await db.collection('route-photos').doc(photoId).get();
        if (check.exists) {
            throw new Error('Error: La foto no se pudo eliminar de la base de datos.');
        }

        return true;

    } catch (error) {
        console.error('Error deleting photo:', error);
        throw error;
    }
}
