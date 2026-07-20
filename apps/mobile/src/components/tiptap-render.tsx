import type { ReactNode } from 'react';
import { Linking, View } from 'react-native';
import { Text } from '@/components/text';
import type { FontWeight } from '@/theme/fonts';
import {
  asTiptapNode,
  parseTiptapValue,
  tiptapChildren,
  tiptapMarkTypes,
  type TiptapNode,
} from '@/lib/tiptap';

/**
 * Tiptap JSON → React Native render katmanı (7.0 kararı). Kart açıklaması ve
 * yorum gövdeleri Tiptap JSON saklanır; bu bileşen JSON ağacını salt-okunur
 * RN bileşenlerine çevirir. Saf gezinme yardımcıları `@/lib/tiptap`'te.
 *
 * Desteklenen düğümler: `doc`, `paragraph`, `heading`, `bulletList`,
 * `orderedList`, `listItem`, `blockquote`, `codeBlock`, `horizontalRule`,
 * `hardBreak`, `text`, `mention`. Mark'lar: `bold`, `italic`, `strike`,
 * `code`, `link`. Tam mobil rich editör yok (7.0) — yalnız render.
 */

/**
 * Bir text düğümündeki `link` mark'ının `href`'i (yoksa `null`). Web editörü
 * StarterKit `link` extension'ıyla link üretebilir; render tarafında `href`'i
 * mark objesinden okuruz (`tiptapMarkTypes` yalnız tip kümesini verir).
 */
function tiptapLinkHref(node: TiptapNode): string | null {
  if (!Array.isArray(node.marks)) return null;
  for (const raw of node.marks) {
    const mark = asTiptapNode(raw);
    if (mark?.type === 'link' && typeof mark.attrs?.href === 'string') return mark.attrs.href;
  }
  return null;
}

/**
 * Yalnız güvenli protokoller açılır — web editörünün XSS allowlist'i (`http(s)`,
 * `mailto`) temel alınır; `tel:` mobilde ek olarak izinlidir (güvenli şema,
 * telefonda anlamlı). `javascript:`/`data:` gibi şemalar tıklanamaz kalır.
 */
function isSafeHref(href: string): boolean {
  return /^(https?:|mailto:|tel:)/i.test(href.trim());
}

/**
 * Satır içi düğüm (text / mention / hardBreak) — bir `<Text>` içine girer.
 * `muted` (tamamlanmış checklist maddesi): metin `text-muted-foreground`'a düşer
 * (dış `<Text>` line-through'u ekler); `TiptapRender` bunu geçmez (default `false`).
 */
function renderInline(node: TiptapNode, key: string, muted = false): ReactNode {
  if (node.type === 'hardBreak') return '\n';

  const baseColor = muted ? 'text-muted-foreground' : 'text-foreground';

  if (node.type === 'mention') {
    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
    return (
      <Text key={key} weight="medium" className={muted ? 'text-muted-foreground' : 'text-primary'}>
        @{label}
      </Text>
    );
  }

  if (node.type === 'text' && typeof node.text === 'string') {
    const marks = tiptapMarkTypes(node);
    const weight: FontWeight = marks.has('bold') ? 'semibold' : 'regular';
    const isCode = marks.has('code');
    const inlineStyle = {
      ...(marks.has('italic') ? { fontStyle: 'italic' as const } : {}),
      // `muted` (tamamlanmış madde) iken çizgi HER iç düğüme uygulanır — RN'de
      // nested `<Text>`'e `textDecorationLine` mirası (özellikle Android)
      // tutarsız; dış `<Text>` çizgisi yalnız yedek. `strike` mark'ı da aynı.
      ...(marks.has('strike') || muted ? { textDecorationLine: 'line-through' as const } : {}),
      ...(isCode ? { fontFamily: 'monospace' } : {}),
    };

    // Link mark: güvenli `href` ise tıklanınca sistem tarayıcı/uygulama açılır.
    // `<Text onPress>` satır-içi çalışır (Pressable gerekmez) ve `numberOfLines`
    // kırpmasıyla uyumludur.
    const href = tiptapLinkHref(node);
    if (href && isSafeHref(href)) {
      return (
        <Text
          key={key}
          weight={weight}
          onPress={() => {
            // Desteklenmeyen şema / handler yoksa `openURL` reject eder — yut
            // (unhandled rejection uyarısı / crash olmasın).
            void Linking.openURL(href).catch(() => {});
          }}
          className={muted ? 'text-muted-foreground underline' : 'text-primary underline'}
          style={inlineStyle}
        >
          {node.text}
        </Text>
      );
    }

    return (
      <Text
        key={key}
        weight={weight}
        className={isCode && !muted ? 'text-destructive' : baseColor}
        style={inlineStyle}
      >
        {node.text}
      </Text>
    );
  }

  return null;
}

/** Bir bloğun satır içi çocuklarını tek `<Text>` gövdesi olarak verir. */
function inlineChildren(node: TiptapNode): ReactNode[] {
  return tiptapChildren(node).map((child, index) => renderInline(child, `i${index}`));
}

/** Blok düzeyi düğüm (paragraf / başlık / liste / blockquote / kod …). */
function renderBlock(node: TiptapNode, key: string): ReactNode {
  switch (node.type) {
    case 'paragraph':
      return (
        <Text key={key} className="text-sm leading-5 text-foreground">
          {inlineChildren(node)}
        </Text>
      );

    case 'heading': {
      const level = typeof node.attrs?.level === 'number' ? node.attrs.level : 3;
      const size = level <= 1 ? 'text-xl' : level === 2 ? 'text-lg' : 'text-base';
      return (
        <Text key={key} weight="semibold" className={`${size} text-foreground`}>
          {inlineChildren(node)}
        </Text>
      );
    }

    case 'bulletList':
    case 'orderedList':
      return (
        <View key={key} className="gap-1">
          {tiptapChildren(node).map((item, index) => (
            <View key={`li${index}`} className="flex-row gap-2">
              <Text className="text-sm text-muted-foreground">
                {node.type === 'orderedList' ? `${index + 1}.` : '•'}
              </Text>
              <View className="flex-1 gap-1">
                {tiptapChildren(item).map((child, ci) => renderBlock(child, `c${ci}`))}
              </View>
            </View>
          ))}
        </View>
      );

    case 'blockquote':
      return (
        <View key={key} className="gap-1 border-l-2 border-border pl-3">
          {tiptapChildren(node).map((child, index) => renderBlock(child, `q${index}`))}
        </View>
      );

    case 'codeBlock':
      return (
        <View key={key} className="rounded-lg bg-muted p-3">
          <Text className="text-xs text-foreground" style={{ fontFamily: 'monospace' }}>
            {tiptapChildren(node)
              .map((child) => (typeof child.text === 'string' ? child.text : ''))
              .join('')}
          </Text>
        </View>
      );

    case 'horizontalRule':
      return <View key={key} className="h-px bg-border" />;

    default:
      // Bilinmeyen blok — çocuklarını yine de göstermeye çalış.
      if (tiptapChildren(node).length > 0) {
        return (
          <View key={key} className="gap-2">
            {tiptapChildren(node).map((child, index) => renderBlock(child, `d${index}`))}
          </View>
        );
      }
      return null;
  }
}

/**
 * Saklanan rich-text değerini (Tiptap JSON string | legacy düz metin | obje)
 * salt-okunur RN ağacına render eder.
 */
export function TiptapRender({ doc }: { doc: unknown }) {
  const root = parseTiptapValue(doc);
  if (!root) return null;
  const blocks = root.type === 'doc' ? tiptapChildren(root) : [root];
  return <View className="gap-2">{blocks.map((block, index) => renderBlock(block, `b${index}`))}</View>;
}

/**
 * Bir düğümün satır-içi parçalarını tek `<Text>` ağacına düzleştirir: text/
 * mention/hardBreak doğrudan eklenir, blok/bilinmeyen düğümler çocuklarına
 * inilir. `out` yerinde biriktirilir (lokal accumulator; `tiptapToPlainText`
 * ile aynı desen).
 */
function collectInline(
  node: TiptapNode,
  keyPrefix: string,
  muted: boolean,
  out: ReactNode[],
): void {
  const el = renderInline(node, keyPrefix, muted);
  if (el !== null) {
    out.push(el);
    return;
  }
  tiptapChildren(node).forEach((child, i) => collectInline(child, `${keyPrefix}.${i}`, muted, out));
}

/**
 * Rich-text değerini **tek satır-içi `<Text>`** olarak render eder — checklist
 * maddesi gibi kompakt, `numberOfLines` ile kırpılabilir bağlamlar için.
 * `TiptapRender`'ın blok yerleşiminden (çok satır `View`) farkı: tüm bloklar
 * `\n` ile ayrılıp tek `<Text>` içine düzleştirilir, böylece `numberOfLines`
 * tüm içeriği kırpar. Biçim mark'ları (bold/italic/strike/code/link) korunur.
 *
 * `muted` (tamamlanmış madde): dış `<Text>` line-through, iç metinler
 * `text-muted-foreground` (renderInline üzerinden). `className` yalnız boyut/
 * satır aralığı taşımalı; renk `muted`'a göre iç düğümlerden gelir.
 */
export function TiptapInline({
  doc,
  numberOfLines,
  muted = false,
  className = 'text-sm leading-5',
}: {
  doc: unknown;
  numberOfLines?: number;
  muted?: boolean;
  className?: string;
}) {
  const root = parseTiptapValue(doc);
  if (!root) return null;
  const blocks = root.type === 'doc' ? tiptapChildren(root) : [root];
  const parts: ReactNode[] = [];
  blocks.forEach((block, bi) => {
    if (bi > 0) parts.push('\n');
    collectInline(block, `b${bi}`, muted, parts);
  });
  return (
    <Text
      numberOfLines={numberOfLines}
      className={className}
      style={muted ? { textDecorationLine: 'line-through' } : undefined}
    >
      {parts}
    </Text>
  );
}
