import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Text } from '@/components/text';
import type { FontWeight } from '@/theme/fonts';
import {
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
 * `code`. Tam mobil rich editör yok (7.0) — yalnız render.
 */

/** Satır içi düğüm (text / mention / hardBreak) — bir `<Text>` içine girer. */
function renderInline(node: TiptapNode, key: string): ReactNode {
  if (node.type === 'hardBreak') return '\n';

  if (node.type === 'mention') {
    const label = typeof node.attrs?.label === 'string' ? node.attrs.label : '';
    return (
      <Text key={key} weight="medium" className="text-primary">
        @{label}
      </Text>
    );
  }

  if (node.type === 'text' && typeof node.text === 'string') {
    const marks = tiptapMarkTypes(node);
    const weight: FontWeight = marks.has('bold') ? 'semibold' : 'regular';
    const isCode = marks.has('code');
    return (
      <Text
        key={key}
        weight={weight}
        className={isCode ? 'text-destructive' : 'text-foreground'}
        style={{
          ...(marks.has('italic') ? { fontStyle: 'italic' as const } : {}),
          ...(marks.has('strike') ? { textDecorationLine: 'line-through' as const } : {}),
          ...(isCode ? { fontFamily: 'monospace' } : {}),
        }}
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
