/**
 * Faz 14C — Klasik pano PDF için React-PDF Document component (DEM-294).
 *
 * Eski Pusula `src/components/reports/ProjectReportDocument.tsx` (915 satır)
 * v2 board domain'ine adapte. Stil sabitleri birebir korundu; yapı 14A
 * kararlarıyla revize:
 *   - karar 2: "Acil" göstergesi kaldırıldı (kapakta 4→3 metrik; kart
 *     satırlarında "ACİL" badge yok)
 *   - karar 3: 2. sayfa "Proje Detayları" kaldırıldı (4 sayfa kategorisi)
 *   - karar 7: kart altında son 5 yorum + "ve M yorum daha" footer
 *   - karar 8: checklist kart satırının altında indented (`└─`)
 *   - karar 12: boş pano (0 liste / 0 kart) → "Veri yok" sayfası
 *
 * Spec: `docs/process/08-faz-14-klasik-pdf-plani.md` §8.3 + §16.18.
 * Veri sözleşmesi: `BoardReportData` (`@pusula/api`, 14D — DEM-293).
 *
 * **i18n:** Tüm görünür metinler `reports.classic.*` namespace'inden
 * gelir. `DEFAULT_I18N` haritası TR fallback'leri sabitler — yeterli
 * sürdürülebilirlik için 14G (DEM-297) `apps/web/src/locales/{tr,en}/reports.json`'a
 * key'leri ekler ve route handler (14E) `i18n` payload'unu component'e
 * iletir (CLAUDE.md §3 / 02-teknoloji-kararlari.md kural #8 i18n disiplini).
 */
import { Document, Page, StyleSheet, Text, View } from '@react-pdf/renderer';
import type { BoardReportData, ClassicReportCard } from '@pusula/api';

import { registerReportFonts } from './fonts';

registerReportFonts();

const PALETTE = {
  headerBg: '#1f2937',
  headerText: '#ffffff',
  headerSubtitle: '#d1d5db',
  body: '#374151',
  muted: '#6b7280',
  primary: '#3b82f6',
  success: '#10b981',
  warning: '#f59e0b',
  divider: '#e5e7eb',
  surface: '#f8fafc',
  surfaceBorder: '#e2e8f0',
} as const;

/**
 * 14A karar 11 — `reports.classic.*` i18n key'lerinin TR fallback haritası.
 * 14G (DEM-297) `apps/web/src/locales/{tr,en}/reports.json`'a aynı key'leri
 * ekler; route handler (14E) `i18n` payload'unu component'e iletir.
 */
const DEFAULT_I18N: Record<string, string> = {
  'reports.classic.cover.title': 'PANO RAPORU',
  'reports.classic.cover.boardInfoHeading': 'Pano Bilgileri',
  'reports.classic.cover.boardNameLabel': 'Pano Adı:',
  'reports.classic.cover.workspaceLabel': 'Çalışma Alanı:',
  'reports.classic.cover.memberCountLabel': 'Üye Sayısı:',
  'reports.classic.cover.createdAtLabel': 'Oluşturma:',
  'reports.classic.cover.archivedAtLabel': 'Arşivlendi:',
  'reports.classic.cover.statsHeading': 'Pano İstatistikleri',
  'reports.classic.cover.metricTotal': 'Toplam Kart',
  'reports.classic.cover.metricCompleted': 'Tamamlanan',
  'reports.classic.cover.metricOpen': 'Açık',
  'reports.classic.cover.overallProgress': 'Genel İlerleme: %',
  'reports.classic.cover.footerAuto':
    'Bu rapor {date} tarihinde Pusula tarafından otomatik olarak oluşturulmuştur.',
  'reports.classic.members.title': 'PANO ÜYELERİ',
  'reports.classic.members.noMembers': 'Bu panoda henüz üye yok.',
  'reports.classic.members.metricTotal': 'Toplam Üye',
  'reports.classic.members.metricPerMember': 'Üye Başı Kart',
  'reports.classic.members.metricUnassigned': 'Atanmamış Açık Kart',
  'reports.classic.members.cardsHeading': 'Üye Kartları',
  'reports.classic.members.activeCards': 'aktif kart',
  'reports.classic.members.footer': 'Sayfa 2 — Pano Üyeleri',
  'reports.classic.empty.title': 'GÖREVLER',
  'reports.classic.empty.heading': 'Bu panoda henüz kart yok',
  'reports.classic.empty.description':
    'Kart eklendikten sonra rapor liste ve yorum sayfalarıyla zenginleşir.',
  'reports.classic.empty.footer': 'Sayfa 3 — Veri yok',
  'reports.classic.list.title': 'GÖREV DETAYLARI',
  'reports.classic.list.sectionSummarySuffix': '— Bölüm Özeti',
  'reports.classic.list.noCards': 'Bu listede henüz kart bulunmuyor.',
  'reports.classic.list.metricTotal': 'Toplam Kart',
  'reports.classic.list.metricCompleted': 'Tamamlanan',
  'reports.classic.list.cardsHeading': 'Kartlar',
  'reports.classic.list.tableStatus': 'Durum',
  'reports.classic.list.tableCardName': 'Kart Adı',
  'reports.classic.list.tableAssigneeDue': 'Atanan / Bitiş',
  'reports.classic.list.unassigned': 'Atanmamış',
  'reports.classic.list.footer': 'Sayfa {page} — {listName}',
  'reports.classic.card.recentCommentsHeading': 'Son Yorumlar',
  'reports.classic.card.moreCommentsFooter': '… ve {count} yorum daha',
  'reports.classic.author.guest': 'Misafir',
  'reports.classic.author.deleted': 'Silinmiş kullanıcı',
};

type Translator = (key: string, params?: Record<string, string | number>) => string;

function createTranslator(i18n?: Record<string, string>): Translator {
  return (key, params) => {
    const template = i18n?.[key] ?? DEFAULT_I18N[key] ?? key;
    if (!params) return template;
    return template.replace(/\{(\w+)\}/g, (_, name: string) =>
      params[name] !== undefined ? String(params[name]) : `{${name}}`,
    );
  };
}

const styles = StyleSheet.create({
  page: {
    fontFamily: 'Roboto',
    fontSize: 10,
    padding: 30,
    backgroundColor: '#ffffff',
  },

  header: {
    backgroundColor: PALETTE.headerBg,
    padding: 20,
    color: PALETTE.headerText,
    marginBottom: 20,
    marginLeft: -30,
    marginRight: -30,
    marginTop: -30,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: 700,
    color: PALETTE.headerText,
    marginBottom: 8,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 14,
    fontWeight: 400,
    color: PALETTE.headerSubtitle,
    textAlign: 'center',
  },

  footer: {
    marginTop: 'auto',
    padding: 20,
    fontSize: 8,
    color: PALETTE.muted,
    borderTop: `1px solid ${PALETTE.divider}`,
    marginLeft: -30,
    marginRight: -30,
    marginBottom: -30,
    textAlign: 'center',
  },

  content: { paddingTop: 0, flex: 1 },

  sectionTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: PALETTE.headerBg,
    marginTop: 25,
    marginBottom: 15,
    borderBottom: `2px solid ${PALETTE.primary}`,
    paddingBottom: 5,
  },
  subsectionTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: '#1f2937',
    marginTop: 20,
    marginBottom: 10,
  },

  bodyText: {
    fontSize: 10,
    lineHeight: 1.6,
    color: PALETTE.body,
  },
  smallText: {
    fontSize: 9,
    color: PALETTE.muted,
  },

  infoBox: {
    backgroundColor: PALETTE.surface,
    border: `1px solid ${PALETTE.surfaceBorder}`,
    borderRadius: 8,
    padding: 15,
    marginBottom: 15,
  },

  listItem: {
    flexDirection: 'row',
    marginBottom: 8,
    alignItems: 'flex-start',
  },
  inlineLabel: {
    fontSize: 10,
    fontWeight: 600,
    color: PALETTE.body,
    width: 120,
  },

  metricsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 15,
  },
  metricBox: {
    flex: 1,
    margin: 5,
    padding: 15,
    backgroundColor: '#ffffff',
    border: `2px solid ${PALETTE.divider}`,
    borderRadius: 10,
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 20,
    fontWeight: 700,
    color: PALETTE.headerBg,
    marginBottom: 5,
  },
  metricLabel: {
    fontSize: 9,
    color: PALETTE.muted,
    textAlign: 'center',
  },

  progressContainer: { marginVertical: 15 },
  progressBar: {
    height: 20,
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    overflow: 'hidden',
    border: `1px solid ${PALETTE.divider}`,
  },
  progressFill: { height: '100%', backgroundColor: PALETTE.success, borderRadius: 10 },

  tableHeaderRow: {
    flexDirection: 'row',
    borderBottom: `2px solid ${PALETTE.headerBg}`,
    paddingVertical: 10,
    backgroundColor: '#f3f4f6',
  },
  tableRow: {
    flexDirection: 'row',
    borderBottom: `1px solid ${PALETTE.divider}`,
    paddingVertical: 8,
    alignItems: 'center',
  },
  tableCellSmall: { width: '12%', paddingHorizontal: 8 },
  tableCellLarge: { flex: 2, paddingHorizontal: 8 },
  tableCellMedium: { width: '25%', paddingHorizontal: 8 },

  taskStatus: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderStyle: 'solid',
    borderColor: PALETTE.divider,
  },
  taskStatusCompleted: { backgroundColor: PALETTE.success, borderColor: PALETTE.success },
  taskStatusPending: { backgroundColor: PALETTE.warning, borderColor: PALETTE.warning },

  indentedBlock: {
    marginLeft: 20,
    paddingLeft: 12,
    borderLeftWidth: 2,
    borderLeftStyle: 'solid',
    borderLeftColor: PALETTE.divider,
    paddingVertical: 6,
  },
  indentedHeading: {
    fontSize: 9,
    fontWeight: 600,
    color: PALETTE.body,
    marginBottom: 3,
  },
  indentedItem: {
    fontSize: 9,
    color: PALETTE.body,
    marginBottom: 2,
    lineHeight: 1.4,
  },
  indentedItemDone: {
    textDecoration: 'line-through',
    color: PALETTE.muted,
  },
  commentMeta: {
    fontSize: 8,
    color: PALETTE.muted,
    marginBottom: 1,
  },
  commentBody: {
    fontSize: 9,
    color: PALETTE.body,
    marginBottom: 4,
    lineHeight: 1.4,
  },
  moreFooter: {
    fontSize: 8,
    color: PALETTE.muted,
    fontStyle: 'italic',
    marginTop: 2,
  },

  memberCard: {
    flexDirection: 'row',
    backgroundColor: PALETTE.surface,
    border: `1px solid ${PALETTE.surfaceBorder}`,
    borderRadius: 8,
    padding: 10,
    marginBottom: 8,
    alignItems: 'center',
  },
  memberInfo: { flex: 1, marginLeft: 10 },
  memberName: { fontSize: 11, fontWeight: 600, color: PALETTE.headerBg, marginBottom: 2 },
  memberEmail: { fontSize: 9, color: PALETTE.muted },
  memberRole: {
    fontSize: 8,
    fontWeight: 600,
    color: PALETTE.primary,
    textTransform: 'uppercase',
  },

  emptyStateBox: {
    marginTop: 60,
    alignItems: 'center',
    padding: 40,
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: PALETTE.body,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyStateDescription: {
    fontSize: 10,
    color: PALETTE.muted,
    textAlign: 'center',
  },

  colorSuccess: { color: PALETTE.success },
  colorMuted: { color: PALETTE.muted },
});

/**
 * Tiptap JSON document → plaintext (recursive). React-PDF DOM render etmez,
 * `RichTextContent` (Faz 13) burada kullanılamaz. JSON parse fail ederse veya
 * string ham geliyorsa olduğu gibi döner.
 */
function tiptapJsonToPlainText(input: string | null | undefined): string {
  if (!input) return '';
  const trimmed = input.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return trimmed;
  }
  return walk(parsed).trim();
}

function walk(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const record = node as Record<string, unknown>;
  if (record.type === 'text' && typeof record.text === 'string') return record.text;
  if (record.type === 'hardBreak') return '\n';
  const parts: string[] = [];
  if (Array.isArray(record.content)) {
    for (const child of record.content) parts.push(walk(child));
  }
  const inner = parts.join('');
  if (
    record.type === 'paragraph' ||
    record.type === 'heading' ||
    record.type === 'listItem' ||
    record.type === 'blockquote'
  ) {
    return `${inner}\n`;
  }
  return inner;
}

function clampPlain(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatDate(value: string | Date): string {
  return new Date(value).toLocaleDateString('tr-TR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateTime(value: string | Date): string {
  const d = new Date(value);
  return `${d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })} · ${d.toLocaleTimeString(
    'tr-TR',
    { hour: '2-digit', minute: '2-digit' },
  )}`;
}

function memberDisplayName(name: string | null | undefined, t: Translator): string {
  return name?.trim() || t('reports.classic.author.deleted');
}

function commentAuthorLabel(
  author: { id: string | null; name: string | null },
  t: Translator,
): string {
  if (!author.id) return t('reports.classic.author.guest');
  return memberDisplayName(author.name, t);
}

export interface BoardReportDocumentProps {
  data: BoardReportData;
  /**
   * 14G (DEM-297) — `apps/web/src/locales/{tr,en}/reports.json` `reports.classic.*`
   * key/value haritası. Verilmediğinde `DEFAULT_I18N` (TR) fallback kullanılır.
   */
  i18n?: Record<string, string>;
}

export function BoardReportDocument({ data, i18n }: BoardReportDocumentProps) {
  const t = createTranslator(i18n);
  const { board, workspace, members, lists, stats, generatedAt } = data;
  const generatedLabel = formatDate(generatedAt);
  const isEmpty = stats.totalCards === 0;

  return (
    <Document title={`${board.title} — Pano Raporu`}>
      {/* SAYFA 1 — KAPAK */}
      <Page size="A4" orientation="portrait" style={styles.page}>
        <View style={styles.header}>
          <Text style={styles.mainTitle}>{t('reports.classic.cover.title')}</Text>
          <Text style={styles.subtitle}>
            {workspace.name} · {generatedLabel}
          </Text>
        </View>

        <View style={styles.content}>
          <View style={styles.infoBox}>
            <Text style={[styles.subsectionTitle, { marginTop: 0 }]}>
              {t('reports.classic.cover.boardInfoHeading')}
            </Text>
            <View style={styles.listItem}>
              <Text style={styles.inlineLabel}>{t('reports.classic.cover.boardNameLabel')}</Text>
              <Text style={styles.bodyText}>{board.title}</Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.inlineLabel}>{t('reports.classic.cover.workspaceLabel')}</Text>
              <Text style={styles.bodyText}>{workspace.name}</Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.inlineLabel}>{t('reports.classic.cover.memberCountLabel')}</Text>
              <Text style={styles.bodyText}>{members.length}</Text>
            </View>
            <View style={styles.listItem}>
              <Text style={styles.inlineLabel}>{t('reports.classic.cover.createdAtLabel')}</Text>
              <Text style={styles.bodyText}>{formatDate(board.createdAt)}</Text>
            </View>
            {board.archivedAt && (
              <View style={styles.listItem}>
                <Text style={styles.inlineLabel}>
                  {t('reports.classic.cover.archivedAtLabel')}
                </Text>
                <Text style={[styles.bodyText, styles.colorMuted]}>
                  {formatDate(board.archivedAt)}
                </Text>
              </View>
            )}
          </View>

          <Text style={styles.sectionTitle}>{t('reports.classic.cover.statsHeading')}</Text>

          {/* 14A karar 2 — 3 metrik (acil kaldırıldı) */}
          <View style={styles.metricsContainer}>
            <View style={styles.metricBox}>
              <Text style={styles.metricValue}>{stats.totalCards}</Text>
              <Text style={styles.metricLabel}>{t('reports.classic.cover.metricTotal')}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, styles.colorSuccess]}>{stats.completedCards}</Text>
              <Text style={styles.metricLabel}>{t('reports.classic.cover.metricCompleted')}</Text>
            </View>
            <View style={styles.metricBox}>
              <Text style={[styles.metricValue, { color: PALETTE.primary }]}>{stats.openCards}</Text>
              <Text style={styles.metricLabel}>{t('reports.classic.cover.metricOpen')}</Text>
            </View>
          </View>

          <Text style={[styles.subsectionTitle, { textAlign: 'center' }]}>
            {t('reports.classic.cover.overallProgress')}
            {stats.progressPercent}
          </Text>
          <View style={styles.progressContainer}>
            <View style={styles.progressBar}>
              <View style={[styles.progressFill, { width: `${stats.progressPercent}%` }]} />
            </View>
          </View>
        </View>

        <View style={styles.footer}>
          <Text>{t('reports.classic.cover.footerAuto', { date: generatedLabel })}</Text>
        </View>
      </Page>

      {/* SAYFA 2 — ÜYELER */}
      <Page size="A4" orientation="portrait" style={styles.page} wrap={false}>
        <View style={styles.header}>
          <Text style={styles.mainTitle}>{t('reports.classic.members.title')}</Text>
          <Text style={styles.subtitle}>{board.title}</Text>
        </View>

        <View style={styles.content}>
          {members.length === 0 ? (
            <View style={styles.infoBox}>
              <Text style={[styles.bodyText, styles.colorMuted]}>
                {t('reports.classic.members.noMembers')}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.metricsContainer}>
                <View style={styles.metricBox}>
                  <Text style={styles.metricValue}>{members.length}</Text>
                  <Text style={styles.metricLabel}>
                    {t('reports.classic.members.metricTotal')}
                  </Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={[styles.metricValue, { color: PALETTE.primary }]}>
                    {(() => {
                      const totalAssigned = members.reduce(
                        (s, m) => s + m.assignedCardCount,
                        0,
                      );
                      return members.length > 0 ? Math.round(totalAssigned / members.length) : 0;
                    })()}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {t('reports.classic.members.metricPerMember')}
                  </Text>
                </View>
                <View style={styles.metricBox}>
                  <Text style={[styles.metricValue, styles.colorSuccess]}>
                    {(() => {
                      let unassignedOpen = 0;
                      for (const list of lists) {
                        for (const card of list.cards) {
                          if (!card.completed && card.members.length === 0) unassignedOpen += 1;
                        }
                      }
                      return unassignedOpen;
                    })()}
                  </Text>
                  <Text style={styles.metricLabel}>
                    {t('reports.classic.members.metricUnassigned')}
                  </Text>
                </View>
              </View>

              <Text style={styles.sectionTitle}>
                {t('reports.classic.members.cardsHeading')}
              </Text>
              {members.map((member) => (
                <View key={member.userId} style={styles.memberCard}>
                  <View style={[styles.taskStatus, styles.taskStatusCompleted]} />
                  <View style={styles.memberInfo}>
                    <Text style={styles.memberName}>
                      {memberDisplayName(member.name, t)}
                    </Text>
                    <Text style={styles.memberEmail}>{member.email}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.memberRole}>{member.role}</Text>
                    <Text style={styles.smallText}>
                      {member.assignedCardCount} {t('reports.classic.members.activeCards')}
                    </Text>
                  </View>
                </View>
              ))}
            </>
          )}
        </View>

        <View style={styles.footer}>
          <Text>{t('reports.classic.members.footer')}</Text>
        </View>
      </Page>

      {/* 14A karar 12 — boş pano "Veri yok" sayfası */}
      {isEmpty && (
        <Page size="A4" orientation="portrait" style={styles.page}>
          <View style={styles.header}>
            <Text style={styles.mainTitle}>{t('reports.classic.empty.title')}</Text>
            <Text style={styles.subtitle}>{board.title}</Text>
          </View>
          <View style={styles.content}>
            <View style={styles.emptyStateBox}>
              <Text style={styles.emptyStateTitle}>
                {t('reports.classic.empty.heading')}
              </Text>
              <Text style={styles.emptyStateDescription}>
                {t('reports.classic.empty.description')}
              </Text>
            </View>
          </View>
          <View style={styles.footer}>
            <Text>{t('reports.classic.empty.footer')}</Text>
          </View>
        </Page>
      )}

      {/* SAYFA 3.N — LİSTE BAŞINA AYRI SAYFA */}
      {!isEmpty &&
        lists.map((list, listIndex) => {
          const total = list.cards.length;
          const completed = list.cards.reduce((acc, c) => (c.completed ? acc + 1 : acc), 0);
          return (
            <Page key={list.id} size="A4" orientation="portrait" style={styles.page}>
              <View style={styles.header}>
                <Text style={styles.mainTitle}>{t('reports.classic.list.title')}</Text>
                <Text style={styles.subtitle}>
                  {list.title} — {board.title}
                </Text>
              </View>

              <View style={styles.content}>
                <View style={styles.infoBox}>
                  <Text style={[styles.subsectionTitle, { marginTop: 0 }]}>
                    {list.title} {t('reports.classic.list.sectionSummarySuffix')}
                  </Text>
                  {total === 0 ? (
                    <Text style={[styles.bodyText, styles.colorMuted]}>
                      {t('reports.classic.list.noCards')}
                    </Text>
                  ) : (
                    <View style={styles.metricsContainer}>
                      <View style={styles.metricBox}>
                        <Text style={styles.metricValue}>{total}</Text>
                        <Text style={styles.metricLabel}>
                          {t('reports.classic.list.metricTotal')}
                        </Text>
                      </View>
                      <View style={styles.metricBox}>
                        <Text style={[styles.metricValue, styles.colorSuccess]}>{completed}</Text>
                        <Text style={styles.metricLabel}>
                          {t('reports.classic.list.metricCompleted')}
                        </Text>
                      </View>
                    </View>
                  )}
                </View>

                {total > 0 && (
                  <View>
                    <Text style={styles.sectionTitle}>
                      {t('reports.classic.list.cardsHeading')}
                    </Text>

                    <View style={styles.tableHeaderRow}>
                      <View style={styles.tableCellSmall}>
                        <Text style={[styles.bodyText, { fontWeight: 700 }]}>
                          {t('reports.classic.list.tableStatus')}
                        </Text>
                      </View>
                      <View style={styles.tableCellLarge}>
                        <Text style={[styles.bodyText, { fontWeight: 700 }]}>
                          {t('reports.classic.list.tableCardName')}
                        </Text>
                      </View>
                      <View style={styles.tableCellMedium}>
                        <Text style={[styles.bodyText, { fontWeight: 700 }]}>
                          {t('reports.classic.list.tableAssigneeDue')}
                        </Text>
                      </View>
                    </View>

                    {list.cards.map((card) => (
                      <CardRow key={card.id} card={card} t={t} />
                    ))}
                  </View>
                )}
              </View>

              <View style={styles.footer}>
                <Text>
                  {t('reports.classic.list.footer', {
                    page: 3 + listIndex,
                    listName: list.title,
                  })}
                </Text>
              </View>
            </Page>
          );
        })}
    </Document>
  );
}

interface CardRowProps {
  card: ClassicReportCard;
  t: Translator;
}

/**
 * Tek kart satırı + altında indented bloklar (checklist + son 5 yorum).
 * 14A karar 7 + 8 uygulaması.
 */
function CardRow({ card, t }: CardRowProps) {
  const assignees = card.members.map((m) => memberDisplayName(m.name, t)).join(', ');
  const dueLabel = card.dueAt
    ? new Date(card.dueAt).toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' })
    : null;
  const meta = [assignees || t('reports.classic.list.unassigned'), dueLabel]
    .filter(Boolean)
    .join(' · ');

  return (
    <View>
      <View style={styles.tableRow}>
        <View style={styles.tableCellSmall}>
          <View
            style={[
              styles.taskStatus,
              card.completed ? styles.taskStatusCompleted : styles.taskStatusPending,
            ]}
          />
        </View>
        <View style={styles.tableCellLarge}>
          <Text style={[styles.bodyText, { fontWeight: 600 }]}>{card.title}</Text>
          {card.labels.length > 0 && (
            <Text style={styles.smallText}>
              {card.labels.map((l) => l.name || l.color).join(' • ')}
            </Text>
          )}
        </View>
        <View style={styles.tableCellMedium}>
          <Text style={styles.smallText}>{meta}</Text>
        </View>
      </View>

      {(card.checklists.length > 0 || card.comments.length > 0) && (
        <View style={styles.indentedBlock}>
          {card.checklists.map((checklist) => (
            <View key={checklist.id} style={{ marginBottom: 4 }}>
              <Text style={styles.indentedHeading}>{checklist.title}</Text>
              {checklist.items.map((item) => (
                <Text
                  key={item.id}
                  style={
                    item.completed
                      ? [styles.indentedItem, styles.indentedItemDone]
                      : styles.indentedItem
                  }
                >
                  └─ [{item.completed ? '✓' : ' '}] {item.content}
                </Text>
              ))}
            </View>
          ))}

          {card.comments.length > 0 && (
            <View style={{ marginTop: card.checklists.length > 0 ? 6 : 0 }}>
              <Text style={styles.indentedHeading}>
                {t('reports.classic.card.recentCommentsHeading')}
              </Text>
              {card.comments.map((comment) => {
                const plain = clampPlain(tiptapJsonToPlainText(comment.body), 200);
                return (
                  <View key={comment.id} style={{ marginBottom: 4 }}>
                    <Text style={styles.commentMeta}>
                      {commentAuthorLabel(comment.author, t)} · {formatDateTime(comment.createdAt)}
                    </Text>
                    <Text style={styles.commentBody}>{plain}</Text>
                  </View>
                );
              })}
              {card.commentCount > card.comments.length && (
                <Text style={styles.moreFooter}>
                  {t('reports.classic.card.moreCommentsFooter', {
                    count: card.commentCount - card.comments.length,
                  })}
                </Text>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}

/** Test-only — yardımcı fonksiyonları dışarıdan doğrulamak için. */
export const __testing = { tiptapJsonToPlainText, clampPlain, createTranslator, DEFAULT_I18N };
