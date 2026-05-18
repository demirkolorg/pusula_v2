import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Modal, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { Icon } from '@/components/icon';
import { Text } from '@/components/text';
import { strings } from '@/lib/strings';
import { useTRPC } from '@/trpc/provider';

type ViewerAttachment = { id: string; fileName: string };

type AttachmentImageViewerProps = {
  /** Önizlenecek resim eki; `null` ise modal kapalı. */
  attachment: ViewerAttachment | null;
  onClose: () => void;
};

/**
 * Resim eki tam-ekran önizleme modalı (Faz 7J — web §8.1.14 lightbox karşılığı).
 * Presigned GET URL (`attachment.getDownloadUrl`, TTL 10 dk) modal açılınca
 * tembel çekilir; `staleTime: 0` ile her açılışta taze imzalı URL alınır
 * (global 30 sn `staleTime` mirası kısa-ömürlü URL'i bayatlatmamalı).
 * PDF/Office önizlemesi yok — onlar "İndir/Paylaş" akışına gider.
 */
export function AttachmentImageViewer({ attachment, onClose }: AttachmentImageViewerProps) {
  const trpc = useTRPC();
  const visible = attachment !== null;
  // Presigned URL alındıktan sonra resmin kendisi ağdan inerken spinner.
  const [imageLoading, setImageLoading] = useState(false);

  const urlQuery = useQuery(
    trpc.attachment.getDownloadUrl.queryOptions(
      { attachmentId: attachment?.id ?? '' },
      { enabled: visible, staleTime: 0, gcTime: 5 * 60 * 1000 },
    ),
  );

  // Her yeni ek için resim yükleme göstergesini sıfırla.
  useEffect(() => {
    setImageLoading(visible);
  }, [attachment?.id, visible]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View className="flex-1 bg-black">
        <SafeAreaView edges={['top']}>
          <View className="flex-row items-center gap-3 px-4 py-3">
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={strings.common.close}
              hitSlop={8}
              onPress={onClose}
              className="active:opacity-60"
            >
              <Icon name="x" size={26} color="#ffffff" />
            </Pressable>
            <Text weight="medium" className="flex-1 text-base text-white" numberOfLines={1}>
              {attachment?.fileName ?? ''}
            </Text>
          </View>
        </SafeAreaView>

        <View className="flex-1 items-center justify-center px-2 pb-6">
          {urlQuery.isPending ? (
            <ActivityIndicator size="large" color="#ffffff" />
          ) : urlQuery.isError ? (
            <Text className="px-6 text-center text-base text-white">
              {strings.attachments.previewError}
            </Text>
          ) : (
            <>
              <Image
                source={{ uri: urlQuery.data.url }}
                accessibilityLabel={attachment?.fileName}
                resizeMode="contain"
                className="h-full w-full"
                onLoadEnd={() => setImageLoading(false)}
              />
              {imageLoading ? (
                <View className="absolute">
                  <ActivityIndicator size="large" color="#ffffff" />
                </View>
              ) : null}
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}
