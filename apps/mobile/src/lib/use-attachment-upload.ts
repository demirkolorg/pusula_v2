/**
 * Kart eki — iki-fazlı yükleme hook'u (Faz 7J; açıklama + ilerleme: Faz 7P).
 *
 * Akış (Faz 11 `docs/architecture/09-depolama-ve-arama.md` §9.1):
 *  1. Kullanıcı kamera / galeri / dosya seçiciden bir dosya seçer.
 *  2. `FileSystem.getInfoAsync` ile gerçek bayt boyutu okunur; MIME + boyut
 *     istemci tarafında doğrulanır (backend allowlist + 50 MiB ile aynı).
 *  3. Doğrulanan dosya `pendingFile` olarak bekletilir — çağıran taraf
 *     opsiyonel açıklama girişi (`descriptionSheet`) gösterir; `confirmUpload`
 *     açıklamayla yüklemeyi başlatır, `cancelUpload` dosyayı atar (Faz 7P).
 *  4. `attachment.initiate` draft satır + presigned PUT URL döndürür.
 *  5. Dosya doğrudan MinIO'ya `PUT` edilir (`FileSystem.createUploadTask` —
 *     progress callback `uploadProgress`'i 0–100 günceller, Faz 7P).
 *  6. `attachment.commit` ek'i görünür kılar (activity + realtime + bildirim).
 *
 * Yükleme anlık değildir (ağ) — bu yüzden tam optimistic değil: yükleme
 * sürerken `uploadingName` ile bir bekleyen tile gösterilir, `commit` başarıyla
 * dönünce `attachment.list` invalidate edilir. `commit` `clientMutationId`
 * taşır (collaborative mutation disiplini). Hata her fazda yakalanır; kullanıcı
 * net bir uyarı görür, draft satır 1 saat sonra orphan sweeper'la temizlenir.
 */
import { useCallback, useRef, useState } from 'react';
import { Alert, Linking } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system/legacy';
import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ATTACHMENT_MIME_TYPES, type AttachmentMimeType } from '@pusula/domain';
import { newClientMutationId } from '@/lib/client-mutation-id';
import { uploadPercent, validatePickedFile } from '@/lib/attachment-format';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

/** Ek yükleme kaynağı — bottom sheet'teki üç seçenek. */
export type AttachmentUploadSource = 'camera' | 'gallery' | 'files';

type PickedFile = {
  uri: string;
  /** Picker'ın bildirdiği dosya adı (kamera fotoğrafında türetilir). */
  name: string;
  /** Picker `mimeType`'ı — boş olabilir, dosya adından çözülür. */
  mimeType: string | null;
};

/** Doğrulanmış, açıklama girişi bekleyen dosya (Faz 7P). */
type PendingFile = {
  uri: string;
  name: string;
  mimeType: AttachmentMimeType;
  size: number;
};

type UseAttachmentUploadArgs = {
  cardId: string;
  /** Yükleme bitince kart sayacı tazelensin diye `board.get` invalidate edilir. */
  boardId: string | undefined;
};

export type UseAttachmentUploadResult = {
  /** Seçilen kaynaktan dosya alır; doğrulanırsa açıklama girişini bekletir. */
  pick: (source: AttachmentUploadSource) => void;
  /** Açıklama girişi bekleyen dosyanın adı; yoksa `null`. */
  pendingFileName: string | null;
  /** Bekleyen dosyayı opsiyonel açıklamayla iki-fazlı yüklemeye başlatır. */
  confirmUpload: (description: string | undefined) => void;
  /** Açıklama girişini iptal eder, bekleyen dosyayı atar. */
  cancelUpload: () => void;
  /** Yükleme sürerken yüklenen dosyanın adı; boştaysa `null`. */
  uploadingName: string | null;
  /** MinIO'ya PUT sürerken ilerleme yüzdesi (0–100); diğer fazlarda `null`. */
  uploadProgress: number | null;
};

/** İzin reddedildiğinde ayarlara yönlendiren ortak uyarı. */
function showPermissionDenied(title: string, body: string): void {
  Alert.alert(title, body, [
    { text: strings.common.cancel, style: 'cancel' },
    { text: strings.attachments.openSettings, onPress: () => void Linking.openSettings() },
  ]);
}

export function useAttachmentUpload({
  cardId,
  boardId,
}: UseAttachmentUploadArgs): UseAttachmentUploadResult {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [uploadingName, setUploadingName] = useState<string | null>(null);
  // PUT fazında 0–100; initiate/commit fazlarında `null` → çağıran taraf
  // belirsiz ilerleme için spinner gösterir (Faz 7P).
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  // Doğrulanmış ama henüz yüklenmemiş dosya — açıklama girişi bekler (Faz 7P).
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  // Picker UI'si açıkken `uploadingName` henüz `null` — bu ref seçim anından
  // yükleme bitişine kadar tek akış garantiler (sheet'e çift dokunma korumasi).
  const pickingRef = useRef(false);

  const initiate = useMutation(trpc.attachment.initiate.mutationOptions());
  const commit = useMutation(trpc.attachment.commit.mutationOptions());

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
      strings.attachments.permissionCameraBody,
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
      strings.attachments.permissionGalleryBody,
    );
    return false;
  }, []);

  /** Doğrulanan dosyayı initiate → PUT → commit zinciriyle yükler. */
  const runUpload = useCallback(
    async (file: PendingFile, description: string | undefined) => {
      setUploadingName(file.name);
      // initiate fazı belirsiz — `null` → spinner.
      setUploadProgress(null);
      try {
        const initiated = await initiate.mutateAsync({
          cardId,
          fileName: file.name,
          mimeType: file.mimeType,
          size: file.size,
          description,
          clientMutationId: newClientMutationId(),
        });

        // Dosyayı doğrudan MinIO'ya PUT et. `content-length` platform tarafından
        // gerçek dosya boyutundan (= initiate'e bildirilen `size`) eklenir;
        // presigned imza bu değeri içerir, elle göndermeye gerek yok.
        // `createUploadTask` progress callback'i `uploadProgress`'i besler.
        setUploadProgress(0);
        const task = FileSystem.createUploadTask(
          initiated.upload.url,
          file.uri,
          {
            httpMethod: 'PUT',
            uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
            headers: { 'content-type': file.mimeType },
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

        // PUT bitti — commit fazında bar %100'de tutulur (bara %100'den
        // spinner'a "geri gidiş" titremesi olmaz).
        setUploadProgress(100);
        await commit.mutateAsync({
          attachmentId: initiated.attachmentId,
          clientMutationId: newClientMutationId(),
        });

        // commit başarılı oldu — buradan sonraki refetch hatası kullanıcıya
        // "yükleme başarısız" dedirtmemeli (ek zaten commit edildi). Bu yüzden
        // liste invalidate'i ayrı bir try/catch ile sarılır.
        try {
          // Liste refetch'i `await` edilir — `uploadingName` (bekleyen tile)
          // ancak gerçek ek satırı listeye düştükten sonra temizlenir, aksi
          // halde tek frame'lik "ek kayboldu" titremesi olur.
          await queryClient.invalidateQueries(trpc.attachment.list.queryFilter({ cardId }));
        } catch {
          // Refetch başarısız — bir sonraki ekran odağında yeniden denenir.
        }
        void queryClient.invalidateQueries(trpc.card.activity.list.queryFilter({ cardId }));
        if (boardId) {
          void queryClient.invalidateQueries(trpc.board.get.queryFilter({ boardId }));
        }
      } catch {
        // initiate başarısız (yetki/limit) ya da PUT/commit başarısız —
        // draft satır 1 saat içinde orphan sweeper tarafından temizlenir.
        Alert.alert(strings.attachments.title, strings.attachments.uploadError);
      } finally {
        setUploadingName(null);
        setUploadProgress(null);
      }
    },
    [boardId, cardId, commit, initiate, queryClient, trpc],
  );

  /** Bekleyen dosyayı opsiyonel açıklamayla yüklemeye başlatır. */
  const confirmUpload = useCallback(
    (description: string | undefined) => {
      if (pendingFile === null) return;
      const file = pendingFile;
      setPendingFile(null);
      const trimmed = description?.trim();
      void runUpload(file, trimmed && trimmed.length > 0 ? trimmed : undefined);
    },
    [pendingFile, runUpload],
  );

  /** Açıklama girişini iptal eder — bekleyen dosya yüklenmeden atılır. */
  const cancelUpload = useCallback(() => {
    setPendingFile(null);
  }, []);

  /** Picker çıktısını doğrulayıp açıklama girişine bekletir. */
  const processPicked = useCallback(async (file: PickedFile) => {
    // Yetkili boyut: dosyanın gerçek bayt boyutu — presigned imzadaki
    // `content-length` ile birebir eşleşmeli. Picker `fileSize` ipucu
    // (özellikle iOS sıkıştırma/HEIC dönüşümünde) farklı olabileceğinden
    // kullanılmaz; `getInfoAsync` okunamazsa yükleme reddedilir (yanlış
    // boyutla PUT zaten `SignatureDoesNotMatch` verir).
    let size: number | null = null;
    try {
      const info = await FileSystem.getInfoAsync(file.uri);
      if (info.exists && typeof info.size === 'number') size = info.size;
    } catch {
      // size null kalır → aşağıda 'empty' sebebiyle reddedilir.
    }

    const validation = validatePickedFile({
      mimeType: file.mimeType,
      fileName: file.name,
      size,
    });
    if (!validation.ok) {
      if (validation.reason === 'mime') {
        Alert.alert(strings.attachments.rejectTitle, strings.attachments.rejectMime);
      } else if (validation.reason === 'size') {
        Alert.alert(strings.attachments.rejectTitle, strings.attachments.rejectSize);
      } else {
        Alert.alert(strings.attachments.rejectTitle, strings.attachments.rejectEmpty);
      }
      return;
    }

    // Doğrulandı — yükleme hemen başlamaz; açıklama girişi için bekletilir.
    setPendingFile({
      uri: file.uri,
      name: file.name,
      mimeType: validation.mimeType,
      size: size as number,
    });
  }, []);

  const pick = useCallback(
    (source: AttachmentUploadSource) => {
      // Aynı anda tek akış — uçuştaki yükleme (`uploadingName`), açıklama
      // girişi bekleyen dosya (`pendingFile`) ya da henüz `uploadingName` set
      // edilmemiş açık picker (`pickingRef`) varken yeni seçim yok sayılır.
      if (uploadingName !== null || pendingFile !== null || pickingRef.current) return;
      pickingRef.current = true;

      void (async () => {
        try {
          if (source === 'camera') {
            if (!(await ensureCameraPermission())) return;
            const result = await ImagePicker.launchCameraAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (result.canceled || result.assets.length === 0) return;
            const asset = result.assets[0]!;
            await processPicked({
              uri: asset.uri,
              name: asset.fileName ?? `kamera-${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? 'image/jpeg',
            });
            return;
          }

          if (source === 'gallery') {
            if (!(await ensureGalleryPermission())) return;
            const result = await ImagePicker.launchImageLibraryAsync({
              mediaTypes: ['images'],
              quality: 0.8,
            });
            if (result.canceled || result.assets.length === 0) return;
            const asset = result.assets[0]!;
            await processPicked({
              uri: asset.uri,
              name: asset.fileName ?? `galeri-${Date.now()}.jpg`,
              mimeType: asset.mimeType ?? null,
            });
            return;
          }

          // source === 'files' — belge seçici (izin gerekmez).
          const result = await DocumentPicker.getDocumentAsync({
            type: [...ATTACHMENT_MIME_TYPES],
            copyToCacheDirectory: true,
          });
          if (result.canceled || result.assets.length === 0) return;
          const asset = result.assets[0]!;
          await processPicked({
            uri: asset.uri,
            name: asset.name,
            mimeType: asset.mimeType ?? null,
          });
        } catch {
          // Picker başlatma hatası (nadir) — sessiz yutmadan kullanıcıyı uyar.
          Alert.alert(strings.attachments.title, strings.attachments.uploadError);
        } finally {
          pickingRef.current = false;
        }
      })();
    },
    [ensureCameraPermission, ensureGalleryPermission, pendingFile, processPicked, uploadingName],
  );

  return {
    pick,
    pendingFileName: pendingFile?.name ?? null,
    confirmUpload,
    cancelUpload,
    uploadingName,
    uploadProgress,
  };
}
