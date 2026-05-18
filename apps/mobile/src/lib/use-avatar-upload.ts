/**
 * Hesap avatarı — tek-fazlı yükleme hook'u (DEM-212).
 *
 * Kart eki (`use-attachment-upload.ts`) iki-fazlıdır (initiate → PUT → commit);
 * avatarın aktivite / realtime / bildirim yan etkisi olmadığı için "commit"
 * adımı **yoktur** (DEM-160 kararı — `packages/api/src/routers/user.ts`):
 *
 *  1. Kullanıcı kamera / galeriden bir görsel seçer (kare kırpma — `aspect [1,1]`).
 *  2. `FileSystem.getInfoAsync` ile gerçek bayt boyutu okunur; MIME + boyut
 *     istemci tarafında doğrulanır (`@pusula/domain` avatar allowlist + 10 MiB).
 *  3. `user.initiateAvatarUpload({ mimeType, size })` presigned PUT URL +
 *     eninde sonunda geçerli **public** URL döndürür.
 *  4. Görsel doğrudan MinIO'ya `PUT` edilir (`FileSystem.createUploadTask` —
 *     progress callback yüzdeyi 0–100 günceller).
 *  5. PUT başarılı olunca çağıran taraf public URL'i Better Auth
 *     `authClient.updateUser({ image })` ile yazar — burada DEĞİL.
 *
 * Hook yalnız "görsel seç → MinIO'ya yükle → public URL döndür" adımını sahiplenir;
 * `users.image` yazımı çağırana (profile-edit ekranı) bırakılır — tıpkı web
 * `apps/web/src/app/(app)/account/page.tsx` `handleUploadAvatar` deseni gibi.
 */
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useMutation } from '@tanstack/react-query';
import {
  AVATAR_IMAGE_MAX_BYTES,
  type AvatarImageMimeType,
  avatarImageMimeTypeSchema,
} from '@pusula/domain';
import { uploadPercent } from '@/lib/attachment-format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

/** Avatar yükleme kaynağı — bottom sheet'teki iki seçenek. */
export type AvatarUploadSource = 'camera' | 'gallery';

export type UseAvatarUploadResult = {
  /** Seçilen kaynaktan görsel alır, yükler; başarılıysa public URL'i döndürür. */
  pick: (source: AvatarUploadSource) => Promise<string | null>;
  /** Yükleme uçuştaysa `true` — UI basışı engeller. */
  uploading: boolean;
  /** MinIO'ya PUT sürerken ilerleme yüzdesi (0–100); initiate fazında `null`. */
  uploadProgress: number | null;
};

/** Picker görselini doğrulayan ortak sonuç. */
type ValidatedImage = {
  uri: string;
  mimeType: AvatarImageMimeType;
  size: number;
};

/** İzin reddedildiğinde ayarlara yönlendiren ortak uyarı. */
function showPermissionDenied(title: string, body: string): void {
  Alert.alert(title, body, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: strings.attachments.openSettings, onPress: () => void Linking.openSettings() },
  ]);
}

export function useAvatarUpload(): UseAvatarUploadResult {
  const trpc = useTRPC();
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Picker UI'si açıkken `uploading` henüz `false` — bu ref seçim anından
  // yükleme bitişine kadar tek akış garantiler (sheet'e çift dokunma koruması).
  const pickingRef = useRef(false);

  const initiate = useMutation(trpc.user.initiateAvatarUpload.mutationOptions());

  /** Kamera izni — verilmemişse ister, kalıcı redde ayarları önerir. */
  const ensureCameraPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getCameraPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const asked = await ImagePicker.requestCameraPermissionsAsync();
      if (asked.granted) return true;
    }
    showPermissionDenied(
      strings.attachments.permissionCameraTitle,
      strings.profileEdit.avatarPermissionCameraBody,
    );
    return false;
  }, []);

  /** Galeri (fotoğraf kitaplığı) izni — kamera akışıyla simetrik. */
  const ensureGalleryPermission = useCallback(async (): Promise<boolean> => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    if (current.granted) return true;
    if (current.canAskAgain) {
      const asked = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (asked.granted) return true;
    }
    showPermissionDenied(
      strings.attachments.permissionGalleryTitle,
      strings.profileEdit.avatarPermissionGalleryBody,
    );
    return false;
  }, []);

  /**
   * Picker görselini doğrular: MIME avatar allowlist'inde mi, gerçek bayt
   * boyutu 1..10 MiB aralığında mı. Hata olursa kullanıcı uyarılır, `null` döner.
   */
  const validatePicked = useCallback(
    async (asset: ImagePicker.ImagePickerAsset): Promise<ValidatedImage | null> => {
      // Yetkili boyut: dosyanın gerçek bayt boyutu — presigned imzadaki
      // `content-length` ile birebir eşleşmeli. Picker `fileSize` ipucu (iOS
      // sıkıştırma/HEIC dönüşümünde) farklı olabileceğinden kullanılmaz.
      let size: number | null = null;
      try {
        const info = await FileSystem.getInfoAsync(asset.uri);
        // `Number.isFinite` — `NaN`/`Infinity` boyutu reddedilsin (`NaN <= 0`
        // ve `NaN > max` ikisi de `false`; `validatePickedFile` ile simetri).
        if (info.exists && typeof info.size === 'number' && Number.isFinite(info.size)) {
          size = info.size;
        }
      } catch {
        // size null kalır → aşağıda boş sebebiyle reddedilir.
      }

      // Kırpma sonrası tip değişebilir; `mimeType` boşsa JPEG varsay (kamera /
      // `allowsEditing` çıktısının yaygın biçimi).
      const mime = avatarImageMimeTypeSchema.safeParse(asset.mimeType ?? 'image/jpeg');
      if (!mime.success) {
        Alert.alert(strings.profileEdit.avatarRejectTitle, strings.profileEdit.avatarRejectMime);
        return null;
      }
      if (size === null || size <= 0) {
        Alert.alert(strings.profileEdit.avatarRejectTitle, strings.profileEdit.avatarRejectEmpty);
        return null;
      }
      if (size > AVATAR_IMAGE_MAX_BYTES) {
        Alert.alert(strings.profileEdit.avatarRejectTitle, strings.profileEdit.avatarRejectSize);
        return null;
      }
      return { uri: asset.uri, mimeType: mime.data, size };
    },
    [],
  );

  /** Doğrulanan görseli initiate → PUT zinciriyle yükler, public URL'i döndürür. */
  const runUpload = useCallback(
    async (image: ValidatedImage): Promise<string | null> => {
      setUploading(true);
      // initiate fazı belirsiz — `null` → spinner.
      setUploadProgress(null);
      try {
        const initiated = await initiate.mutateAsync({
          mimeType: image.mimeType,
          size: image.size,
        });

        // Görseli doğrudan MinIO'ya PUT et. Yalnız `content-type` gönderilir —
        // `content-length` platform tarafından gerçek gövde boyutundan eklenir
        // ve presigned imza bu değeri (initiate'e verdiğimiz `size`) içerir;
        // elle göndermek çakışan başlık riski yaratır (`use-attachment-upload`
        // deseniyle aynı — orada da yalnız `content-type` gönderilir).
        setUploadProgress(0);
        const task = FileSystem.createUploadTask(
          initiated.upload.url,
          image.uri,
          {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'content-type': image.mimeType },
          },
          (data) => {
            setUploadProgress(
              uploadPercent(data.totalBytesSent, data.totalBytesExpectedToSend),
            );
          },
        );
        const put = await task.uploadAsync();
        if (!put || put.status < 200 || put.status >= 300) {
          throw new Error(`MinIO PUT ${put?.status ?? 'iptal'}`);
        }
        // Commit fazı yok (avatar tek-fazlı) — ilerleme PUT bitince `finally`'de
        // sıfırlanır; ayrıca %100'e set etmeye gerek yok.
        return initiated.publicUrl;
      } catch {
        // initiate başarısız (yetki/limit) ya da PUT başarısız — orphan avatar
        // objesi sweeper'a bırakılır; kullanıcı net bir uyarı görür.
        Alert.alert(strings.profileEdit.title, strings.profileEdit.avatarUploadError);
        return null;
      } finally {
        setUploading(false);
        setUploadProgress(null);
      }
    },
    [initiate],
  );

  const pick = useCallback(
    async (source: AvatarUploadSource): Promise<string | null> => {
      // Aynı anda tek akış — uçuştaki yükleme ya da henüz `uploading` set
      // edilmemiş açık picker varken yeni seçim yok sayılır.
      if (uploading || pickingRef.current) return null;
      pickingRef.current = true;
      try {
        // `mediaTypes: ['images']` + `allowsEditing` ile kare kırpma — avatar
        // her zaman 1:1 (`EntityAvatar` yuvarlatılmış kare bekler).
        const options: ImagePicker.ImagePickerOptions = {
          mediaTypes: ['images'],
          allowsEditing: true,
          aspect: [1, 1],
          quality: 0.8,
        };
        let result: ImagePicker.ImagePickerResult;
        if (source === 'camera') {
          if (!(await ensureCameraPermission())) return null;
          result = await ImagePicker.launchCameraAsync(options);
        } else {
          if (!(await ensureGalleryPermission())) return null;
          result = await ImagePicker.launchImageLibraryAsync(options);
        }
        if (result.canceled || result.assets.length === 0) return null;

        const validated = await validatePicked(result.assets[0]!);
        if (!validated) return null;
        return await runUpload(validated);
      } catch {
        // Picker başlatma hatası (nadir) — sessiz yutmadan kullanıcıyı uyar.
        Alert.alert(strings.profileEdit.title, strings.profileEdit.avatarUploadError);
        return null;
      } finally {
        pickingRef.current = false;
      }
    },
    [ensureCameraPermission, ensureGalleryPermission, runUpload, uploading, validatePicked],
  );

  return { pick, uploading, uploadProgress };
}
