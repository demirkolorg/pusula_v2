/**
 * Public API + Bot Erişimi (Task 10) — elle bakımlı OpenAPI 3.1 dokümanı.
 *
 * Bu obje `GET /api/v1/openapi.json` üzerinden **auth'suz** servis edilir
 * (`./index.ts`). Yeni bağımlılık yok — düz TS objesi. Kaynak-of-truth REST
 * route'larıdır; `openapi.test.ts` drift testi spec `paths`'i gerçek Hono
 * route yüzeyiyle iki yönlü karşılaştırır, böylece spec kod ile senkron kalır.
 *
 * Bilinçli sapmalar (spec'te açıkça örneklenir):
 *  - Tüm mutasyon uçları `Idempotency-Key` (UUID) header'ı **ister** → 400.
 *  - `Idempotency-Key` 24 saat best-effort dedup taşır: aynı anahtar + aynı gövde
 *    → ilk 2xx yanıt aynen replay (`Idempotency-Replayed: true`); aynı anahtar
 *    FARKLI gövde → 409 `IDEMPOTENCY_KEY_REUSED`.
 *  - `POST …/archive` gövdesi `{ "archived": false }` ile **restore** yapar.
 *  - `DELETE /cards/{cardId}/members/{userId}` rolü **gövdede** alır (path'te değil).
 *  - `POST …/attachments/commit` `attachmentId`'yi **gövdede** alır.
 *  - `GET …/attachments/{attachmentId}/download-url` bir query'dir → idempotency yok.
 *  - Yorum/checklist madde içeriği düz metin **veya** Tiptap JSON kabul eder.
 *
 * Ayrıntı: `docs/architecture/21-public-api-ve-bot-erisimi.md`.
 */

type JsonObject = Record<string, unknown>;

interface OperationObject {
  tags: string[];
  summary: string;
  operationId: string;
  parameters?: JsonObject[];
  requestBody?: JsonObject;
  responses: JsonObject;
}

type PathItemObject = Partial<
  Record<'get' | 'post' | 'put' | 'patch' | 'delete', OperationObject>
>;

interface OpenApiDocument {
  openapi: string;
  info: JsonObject;
  servers: JsonObject[];
  security: Record<string, string[]>[];
  tags: { name: string; description: string }[];
  paths: Record<string, PathItemObject>;
  components: {
    securitySchemes: Record<string, JsonObject>;
    parameters: Record<string, JsonObject>;
    responses: Record<string, JsonObject>;
    schemas: Record<string, JsonObject>;
  };
}

// --- küçük yardımcılar (tekrar azaltma; hepsi düz obje döndürür) -------------

const refParam = (name: string): JsonObject => ({ $ref: `#/components/parameters/${name}` });
const refResp = (name: string): JsonObject => ({ $ref: `#/components/responses/${name}` });
const refSchema = (name: string): JsonObject => ({ $ref: `#/components/schemas/${name}` });

const idParam = (name: string, description: string): JsonObject => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string' },
  description,
});

const queryParam = (name: string, schema: JsonObject, description: string): JsonObject => ({
  name,
  in: 'query',
  required: false,
  schema,
  description,
});

const jsonBody = (
  properties: JsonObject,
  required: string[] = [],
  description?: string,
): JsonObject => ({
  required: true,
  content: {
    'application/json': {
      schema: {
        type: 'object',
        properties,
        ...(required.length > 0 ? { required } : {}),
        ...(description ? { description } : {}),
      },
    },
  },
});

const jsonResponse = (description: string, schema?: JsonObject): JsonObject =>
  schema
    ? { description, content: { 'application/json': { schema } } }
    : { description };

/** Ortak hata yanıtları — mutasyon/read'e göre 400 ve 404 opsiyonel. */
const errorResponses = (opts: { badRequest?: boolean; notFound?: boolean } = {}): JsonObject => {
  const responses: JsonObject = {};
  if (opts.badRequest) responses['400'] = refResp('BadRequest');
  responses['401'] = refResp('Unauthorized');
  responses['403'] = refResp('Forbidden');
  if (opts.notFound) responses['404'] = refResp('NotFound');
  responses['429'] = refResp('TooManyRequests');
  return responses;
};

// Sık kullanılan şema parçaları.
const stringSchema: JsonObject = { type: 'string' };
const nullableString: JsonObject = { type: ['string', 'null'] };
const boolSchema: JsonObject = { type: 'boolean' };
const positionNeighbors = {
  beforeCardId: { ...nullableString, description: 'Öncesine yerleştirilecek kart id (opsiyonel).' },
  afterCardId: { ...nullableString, description: 'Sonrasına yerleştirilecek kart id (opsiyonel).' },
  newPosition: { type: 'string', description: 'İstemci-hesaplı fractional pozisyon (opsiyonel; sunucu doğrular).' },
};

// ---------------------------------------------------------------------------
//  PATHS
// ---------------------------------------------------------------------------

const paths: Record<string, PathItemObject> = {
  // --- Meta ----------------------------------------------------------------
  '/me': {
    get: {
      tags: ['Meta'],
      summary: 'Key + bot meta bilgisi (ad, boardId, rol, expiry).',
      operationId: 'getMe',
      responses: {
        '200': jsonResponse('Bot kimliği ve key kapsamı.', refSchema('Me')),
        ...errorResponses(),
      },
    },
  },

  // --- Board (okuma) -------------------------------------------------------
  '/board': {
    get: {
      tags: ['Board'],
      summary: 'Panonun kabuğu + listeleri + aktif kartları (key.boardId).',
      operationId: 'getBoard',
      responses: {
        '200': jsonResponse('Board + lists + cards.', refSchema('Entity')),
        ...errorResponses(),
      },
    },
  },
  '/board/activity': {
    get: {
      tags: ['Board'],
      summary: 'Pano aktivite akışı (cursor sayfalı).',
      operationId: 'listBoardActivity',
      parameters: [
        queryParam('limit', { type: 'integer', minimum: 1 }, 'Sayfa boyutu (opsiyonel).'),
        queryParam('cursor', stringSchema, 'Sonraki sayfa cursor\'ı (opsiyonel).'),
        queryParam('type', stringSchema, 'Aktivite tipi filtresi (opsiyonel; geçersiz değer 400).'),
      ],
      responses: {
        '200': jsonResponse('Aktivite öğeleri + nextCursor.', refSchema('Entity')),
        ...errorResponses({ badRequest: true }),
      },
    },
  },
  '/board/members': {
    get: {
      tags: ['Board'],
      summary: 'Pano üyeleri (açık + devralınan adminler).',
      operationId: 'listBoardMembers',
      responses: {
        '200': jsonResponse('Üye listesi.', refSchema('EntityList')),
        ...errorResponses(),
      },
    },
  },

  // --- Lists ---------------------------------------------------------------
  '/lists': {
    post: {
      tags: ['Lists'],
      summary: 'Panonun sonuna liste ekle (member+).',
      operationId: 'createList',
      parameters: [refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          title: { type: 'string', maxLength: 120, description: 'Liste başlığı.' },
          beforeListId: { ...nullableString, description: 'Öncesine yerleştir (opsiyonel).' },
          afterListId: { ...nullableString, description: 'Sonrasına yerleştir (opsiyonel).' },
        },
        ['title'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan liste.', refSchema('Entity')),
        ...errorResponses({ badRequest: true }),
      },
    },
  },
  '/lists/{listId}': {
    patch: {
      tags: ['Lists'],
      summary: 'Liste başlığı / renk / ikon güncelle (en az bir alan; member+).',
      operationId: 'updateList',
      parameters: [idParam('listId', 'Liste id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          title: { type: 'string', maxLength: 120 },
          color: { ...nullableString, description: 'Liste renk token\'ı (null = temizle).' },
          icon: { ...nullableString, description: 'Liste ikon token\'ı (null = temizle).' },
          iconColor: { ...nullableString, description: 'İkon rengi token\'ı (null = temizle).' },
        },
        [],
        'En az bir alan gönderilmeli.',
      ),
      responses: {
        '200': jsonResponse('Güncellenen liste.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/lists/{listId}/move': {
    post: {
      tags: ['Lists'],
      summary: 'Listeyi pano içinde yeniden sırala (member+).',
      operationId: 'moveList',
      parameters: [idParam('listId', 'Liste id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody({
        beforeListId: nullableString,
        afterListId: nullableString,
        newPosition: { type: 'string', description: 'İstemci-hesaplı pozisyon (opsiyonel).' },
      }),
      responses: {
        '200': jsonResponse('Taşınan liste.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/lists/{listId}/archive': {
    post: {
      tags: ['Lists'],
      summary: 'Listeyi arşivle veya geri al ({ "archived": false } = restore; member+).',
      operationId: 'archiveList',
      parameters: [idParam('listId', 'Liste id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody({
        archived: { type: 'boolean', default: true, description: 'false → arşivden geri al.' },
      }),
      responses: {
        '200': jsonResponse('Arşiv durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },

  // --- Cards ---------------------------------------------------------------
  '/cards': {
    post: {
      tags: ['Cards'],
      summary: 'Bir listenin sonuna kart oluştur (member+).',
      operationId: 'createCard',
      parameters: [refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          listId: { type: 'string', description: 'Hedef liste (key.boardId içinde olmalı).' },
          title: { type: 'string', maxLength: 500, description: 'Kart başlığı.' },
          beforeCardId: positionNeighbors.beforeCardId,
          afterCardId: positionNeighbors.afterCardId,
        },
        ['listId', 'title'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan kart.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/archived': {
    get: {
      tags: ['Cards'],
      summary: 'Panonun arşivli kartları (en yeni arşiv önce).',
      operationId: 'listArchivedCards',
      responses: {
        '200': jsonResponse('Arşivli kartlar.', refSchema('EntityList')),
        ...errorResponses(),
      },
    },
  },
  '/cards/{cardId}': {
    get: {
      tags: ['Cards'],
      summary: 'Tek kart + çağıranın ilişkileri.',
      operationId: 'getCard',
      parameters: [idParam('cardId', 'Kart id.')],
      responses: {
        '200': jsonResponse('Kart + ilişkiler.', refSchema('Entity')),
        ...errorResponses({ notFound: true }),
      },
    },
    patch: {
      tags: ['Cards'],
      summary: 'Kart başlığı / açıklama / bitiş / kapak güncelle (member+).',
      operationId: 'updateCard',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          title: { type: 'string', maxLength: 500 },
          description: {
            type: 'string',
            description:
              'Kart açıklaması — düz metin ya da Tiptap JSON. Web\'de Tiptap JSON string ' +
              'veya legacy düz metin olarak render edilir; API düz metni sunucuda Tiptap\'a çevirir.',
          },
          dueAt: { type: ['string', 'null'], format: 'date-time', description: 'Bitiş tarihi (null = temizle).' },
          coverColor: { ...nullableString, description: 'Kapak rengi token\'ı (null = temizle).' },
          coverImageAttachmentId: { ...nullableString, description: 'Kapak görseli ek id (null = temizle).' },
        },
        [],
        'En az bir alan gönderilmeli. Yalnız gönderilen alanlar değişir.',
      ),
      responses: {
        '200': jsonResponse('Güncellenen kart.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/activity': {
    get: {
      tags: ['Cards'],
      summary: 'Kartın aktivite akışı (en yeni önce, ≤ 50).',
      operationId: 'listCardActivity',
      parameters: [idParam('cardId', 'Kart id.')],
      responses: {
        '200': jsonResponse('Kart aktiviteleri.', refSchema('EntityList')),
        ...errorResponses({ notFound: true }),
      },
    },
  },
  '/cards/{cardId}/move': {
    post: {
      tags: ['Cards'],
      summary: 'Kartı aynı pano içinde taşı / yeniden sırala (member+).',
      operationId: 'moveCard',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          fromListId: { type: 'string', description: 'Kartın mevcut listesi.' },
          toListId: { type: 'string', description: 'Hedef liste (aynı pano; çapraz board → 403).' },
          ...positionNeighbors,
        },
        ['fromListId', 'toListId'],
        'Aynı liste içinde yeniden sıralama için `fromListId` = `toListId` gönderin ' +
          '(ikisi de zorunlu). Farklı listeye taşımak için `toListId`\'yi kartın ' +
          'mevcut listesinden farklı verin. Alternatif: `POST /cards/{cardId}/move-to-list` ' +
          '(yalnız `toListId` ister).',
      ),
      responses: {
        '200': jsonResponse('Taşınan kart.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/move-to-list': {
    post: {
      tags: ['Cards'],
      summary: 'Kartı bu panonun herhangi bir listesine taşı (çapraz board → 403; member+).',
      operationId: 'moveCardToList',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          toListId: { type: 'string', description: 'Hedef liste (key.boardId içinde olmalı).' },
          ...positionNeighbors,
        },
        ['toListId'],
      ),
      responses: {
        '200': jsonResponse('Taşınan kart.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/copy': {
    post: {
      tags: ['Cards'],
      summary: 'Kartı bu panonun bir listesine kopyala (çapraz board → 403; member+).',
      operationId: 'copyCard',
      parameters: [idParam('cardId', 'Kaynak kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          toListId: { type: 'string', description: 'Hedef liste (key.boardId içinde olmalı).' },
          beforeCardId: positionNeighbors.beforeCardId,
          afterCardId: positionNeighbors.afterCardId,
          title: { type: 'string', description: 'Kopya başlığı (varsayılan: kaynak + " (kopya)").' },
          includeChecklists: { type: 'boolean', default: false },
          includeMembers: { type: 'boolean', default: false },
          includeLabels: { type: 'boolean', default: false },
        },
        ['toListId'],
      ),
      responses: {
        '201': jsonResponse('Kopyalanan kart.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/archive': {
    post: {
      tags: ['Cards'],
      summary: 'Kartı arşivle veya geri al ({ "archived": false } = restore; member+).',
      operationId: 'archiveCard',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody({
        archived: { type: 'boolean', default: true, description: 'false → arşivden geri al.' },
      }),
      responses: {
        '200': jsonResponse('Arşiv durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/complete': {
    post: {
      tags: ['Cards'],
      summary: 'Kartı tamamlandı işaretle (idempotent; member+).',
      operationId: 'completeCard',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      responses: {
        '200': jsonResponse('Tamamlanma durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/uncomplete': {
    post: {
      tags: ['Cards'],
      summary: 'Kartın tamamlanmasını geri al (idempotent; member+).',
      operationId: 'uncompleteCard',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      responses: {
        '200': jsonResponse('Tamamlanma durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },

  // --- Checklists ----------------------------------------------------------
  '/cards/{cardId}/checklists': {
    get: {
      tags: ['Checklists'],
      summary: 'Kartın checklist\'leri (her biri maddeleriyle).',
      operationId: 'listChecklists',
      parameters: [idParam('cardId', 'Kart id.')],
      responses: {
        '200': jsonResponse('Checklist\'ler + maddeler.', refSchema('EntityList')),
        ...errorResponses({ notFound: true }),
      },
    },
    post: {
      tags: ['Checklists'],
      summary: 'Karta checklist ekle (member+).',
      operationId: 'createChecklist',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        { title: { type: 'string', maxLength: 500, description: 'Checklist başlığı.' } },
        ['title'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan checklist.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/bulk-import': {
    post: {
      tags: ['Checklists'],
      summary: 'Tek seferde N checklist + madde içe aktar (düz metin satırları; member+).',
      operationId: 'bulkImportChecklists',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          checklists: {
            type: 'array',
            minItems: 1,
            maxItems: 20,
            description: 'Checklist listesi (≤ 500 toplam madde).',
            items: {
              type: 'object',
              required: ['title'],
              properties: {
                title: { type: 'string', maxLength: 500 },
                items: {
                  type: 'array',
                  items: { type: 'string', description: 'Madde metni (düz metin).' },
                  description: 'Madde satırları (opsiyonel).',
                },
              },
            },
          },
        },
        ['checklists'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan checklist\'ler.', refSchema('EntityList')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}': {
    patch: {
      tags: ['Checklists'],
      summary: 'Checklist başlığını değiştir (member+).',
      operationId: 'updateChecklist',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({ title: { type: 'string', maxLength: 500 } }, ['title']),
      responses: {
        '200': jsonResponse('Güncellenen checklist.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
    delete: {
      tags: ['Checklists'],
      summary: 'Checklist\'i sil (maddeler cascade; member+).',
      operationId: 'deleteChecklist',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        refParam('IdempotencyKey'),
      ],
      responses: {
        '200': jsonResponse('Silme sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}/archive': {
    post: {
      tags: ['Checklists'],
      summary: 'Checklist arşivle / geri al ({ "archived": false } = restore; member+).',
      operationId: 'archiveChecklist',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody(
        { archived: { type: 'boolean', description: 'true = arşivle, false = geri al.' } },
        ['archived'],
      ),
      responses: {
        '200': jsonResponse('Arşiv durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}/items': {
    post: {
      tags: ['Checklists'],
      summary: 'Checklist\'e madde ekle (member+).',
      operationId: 'createChecklistItem',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody(
        {
          content: refSchema('RichTextInput'),
          parentItemId: { ...nullableString, description: 'İç içe madde için ebeveyn id (opsiyonel).' },
        },
        ['content'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan madde.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}/items/{itemId}': {
    patch: {
      tags: ['Checklists'],
      summary: 'Madde içeriğini düzenle (member+).',
      operationId: 'updateChecklistItem',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        idParam('itemId', 'Madde id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({ content: refSchema('RichTextInput') }, ['content']),
      responses: {
        '200': jsonResponse('Güncellenen madde.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
    delete: {
      tags: ['Checklists'],
      summary: 'Maddeyi sil (alt ağaç cascade; member+).',
      operationId: 'deleteChecklistItem',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        idParam('itemId', 'Madde id.'),
        refParam('IdempotencyKey'),
      ],
      responses: {
        '200': jsonResponse('Silme sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}/items/{itemId}/toggle': {
    post: {
      tags: ['Checklists'],
      summary: 'Maddeyi işaretle / kaldır (member+).',
      operationId: 'toggleChecklistItem',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        idParam('itemId', 'Madde id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody(
        { completed: { type: 'boolean', description: 'true = tamamlandı.' } },
        ['completed'],
      ),
      responses: {
        '200': jsonResponse('Madde durumu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/checklists/{checklistId}/items/{itemId}/reorder': {
    post: {
      tags: ['Checklists'],
      summary: 'Maddeyi checklist içinde yeniden sırala (member+).',
      operationId: 'reorderChecklistItem',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('checklistId', 'Checklist id.'),
        idParam('itemId', 'Madde id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({
        beforeItemId: { ...nullableString, description: 'Öncesine yerleştir (opsiyonel).' },
        afterItemId: { ...nullableString, description: 'Sonrasına yerleştir (opsiyonel).' },
      }),
      responses: {
        '200': jsonResponse('Sıralanan madde.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },

  // --- Comments ------------------------------------------------------------
  '/cards/{cardId}/comments': {
    get: {
      tags: ['Comments'],
      summary: 'Kart- veya checklist-madde-kapsamlı yorum thread\'i.',
      operationId: 'listComments',
      parameters: [
        idParam('cardId', 'Kart id.'),
        queryParam('checklistItemId', stringSchema, 'Verilirse madde thread\'i döner (opsiyonel).'),
      ],
      responses: {
        '200': jsonResponse('Yorumlar (+ previewText).', refSchema('EntityList')),
        ...errorResponses({ notFound: true }),
      },
    },
    post: {
      tags: ['Comments'],
      summary: 'Yorum ekle (member+).',
      operationId: 'createComment',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          body: refSchema('RichTextInput'),
          checklistItemId: { type: 'string', description: 'Verilirse yorum bu maddeye bağlanır (opsiyonel).' },
        },
        ['body'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan yorum (+ previewText).', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/comments/{commentId}': {
    patch: {
      tags: ['Comments'],
      summary: 'Kendi yorumunu düzenle (başkasınınki → 403; member+).',
      operationId: 'updateComment',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('commentId', 'Yorum id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({ body: refSchema('RichTextInput') }, ['body']),
      responses: {
        '200': jsonResponse('Güncellenen yorum (+ previewText).', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
    delete: {
      tags: ['Comments'],
      summary: 'Kendi yorumunu sil (başkasınınki → 403; member+).',
      operationId: 'deleteComment',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('commentId', 'Yorum id.'),
        refParam('IdempotencyKey'),
      ],
      responses: {
        '200': jsonResponse('Silme sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },

  // --- Card members & labels ----------------------------------------------
  '/cards/{cardId}/members': {
    get: {
      tags: ['Card members & labels'],
      summary: 'Kartın atanan / izleyen üyeleri.',
      operationId: 'listCardMembers',
      parameters: [idParam('cardId', 'Kart id.')],
      responses: {
        '200': jsonResponse('Kart üyeleri.', refSchema('EntityList')),
        ...errorResponses({ notFound: true }),
      },
    },
    post: {
      tags: ['Card members & labels'],
      summary: 'Karta üye ekle ({ userId, role }; self-add → 403; member+).',
      operationId: 'addCardMember',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          userId: { type: 'string', description: 'Eklenecek kullanıcı id.' },
          role: refSchema('CardRole'),
        },
        ['userId', 'role'],
      ),
      responses: {
        '201': jsonResponse('Eklenen üye.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/members/{userId}': {
    delete: {
      tags: ['Card members & labels'],
      summary: 'Kart üyeliğini kaldır. Rol GÖVDEDE alınır ({ "role": "assignee" }); member+.',
      operationId: 'removeCardMember',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('userId', 'Kullanıcı id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({ role: refSchema('CardRole') }, ['role']),
      responses: {
        '200': jsonResponse('Kaldırma sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/labels': {
    post: {
      tags: ['Card members & labels'],
      summary: 'Karta etiket ekle ({ labelId }; member+).',
      operationId: 'addCardLabel',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        { labelId: { type: 'string', description: 'Etiket id (aynı pano).' } },
        ['labelId'],
      ),
      responses: {
        '201': jsonResponse('Eklenen etiket bağlantısı.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/labels/{labelId}': {
    delete: {
      tags: ['Card members & labels'],
      summary: 'Kart etiketini kaldır (member+).',
      operationId: 'removeCardLabel',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('labelId', 'Etiket id.'),
        refParam('IdempotencyKey'),
      ],
      responses: {
        '200': jsonResponse('Kaldırma sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },

  // --- Attachments ---------------------------------------------------------
  '/cards/{cardId}/attachments': {
    get: {
      tags: ['Attachments'],
      summary: 'Kartın (veya maddesinin) commit\'li ekleri.',
      operationId: 'listAttachments',
      parameters: [
        idParam('cardId', 'Kart id.'),
        queryParam('checklistItemId', stringSchema, 'Verilirse madde ekleri döner (opsiyonel).'),
      ],
      responses: {
        '200': jsonResponse('Ekler.', refSchema('EntityList')),
        ...errorResponses({ notFound: true }),
      },
    },
  },
  '/cards/{cardId}/attachments/initiate': {
    post: {
      tags: ['Attachments'],
      summary: 'İki-fazlı yüklemenin 1. adımı: taslak satır + presigned PUT URL (member+).',
      operationId: 'initiateAttachment',
      parameters: [idParam('cardId', 'Kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          fileName: { type: 'string', maxLength: 255 },
          mimeType: { type: 'string', description: 'İzin verilen MIME tipi.' },
          size: { type: 'integer', minimum: 1, description: 'Dosya boyutu (byte).' },
          checklistItemId: { type: 'string', description: 'Ek bir maddeye aitse madde id (opsiyonel).' },
          description: { type: 'string', description: 'Açıklama (opsiyonel).' },
        },
        ['fileName', 'mimeType', 'size'],
      ),
      responses: {
        '201': jsonResponse('Taslak ek + presigned PUT URL.', refSchema('AttachmentInitiate')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/attachments/commit': {
    post: {
      tags: ['Attachments'],
      summary: '2. adım: yüklemeyi kalıcılaştır. attachmentId GÖVDEDE alınır (member+).',
      operationId: 'commitAttachment',
      parameters: [idParam('cardId', 'Yönlendirme için kart id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody(
        { attachmentId: { type: 'string', description: 'initiate\'ten dönen taslak ek id.' } },
        ['attachmentId'],
      ),
      responses: {
        '200': jsonResponse('Commit\'lenen ek.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/attachments/{attachmentId}': {
    patch: {
      tags: ['Attachments'],
      summary: 'Ek açıklamasını düzenle (yükleyen / board admin).',
      operationId: 'updateAttachment',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('attachmentId', 'Ek id.'),
        refParam('IdempotencyKey'),
      ],
      requestBody: jsonBody({
        description: { type: 'string', description: 'Yeni açıklama (boş = temizle).' },
      }),
      responses: {
        '200': jsonResponse('Güncellenen ek.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
    delete: {
      tags: ['Attachments'],
      summary: 'Eki sil (yükleyen / board admin).',
      operationId: 'deleteAttachment',
      parameters: [
        idParam('cardId', 'Kart id.'),
        idParam('attachmentId', 'Ek id.'),
        refParam('IdempotencyKey'),
      ],
      responses: {
        '200': jsonResponse('Silme sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
  '/cards/{cardId}/attachments/{attachmentId}/download-url': {
    get: {
      tags: ['Attachments'],
      summary: 'Presigned GET URL (query; idempotency yok; viewer+).',
      operationId: 'getAttachmentDownloadUrl',
      parameters: [idParam('cardId', 'Kart id.'), idParam('attachmentId', 'Ek id.')],
      responses: {
        '200': jsonResponse('Presigned indirme URL\'i.', refSchema('DownloadUrl')),
        ...errorResponses({ notFound: true }),
      },
    },
  },

  // --- Labels --------------------------------------------------------------
  '/labels': {
    get: {
      tags: ['Labels'],
      summary: 'Panonun etiketleri (viewer+).',
      operationId: 'listLabels',
      responses: {
        '200': jsonResponse('Etiketler.', refSchema('EntityList')),
        ...errorResponses(),
      },
    },
    post: {
      tags: ['Labels'],
      summary: 'Etiket oluştur (member+).',
      operationId: 'createLabel',
      parameters: [refParam('IdempotencyKey')],
      requestBody: jsonBody(
        {
          color: { type: 'string', description: 'Palet renk token\'ı.' },
          name: { type: 'string', maxLength: 50, description: 'Etiket adı (opsiyonel; renk-only geçerli).' },
        },
        ['color'],
      ),
      responses: {
        '201': jsonResponse('Oluşturulan etiket.', refSchema('Entity')),
        ...errorResponses({ badRequest: true }),
      },
    },
  },
  '/labels/{labelId}': {
    patch: {
      tags: ['Labels'],
      summary: 'Etiket rengi / adı güncelle (member+).',
      operationId: 'updateLabel',
      parameters: [idParam('labelId', 'Etiket id.'), refParam('IdempotencyKey')],
      requestBody: jsonBody({
        color: { type: 'string', description: 'Palet renk token\'ı.' },
        name: { type: 'string', maxLength: 50 },
      }),
      responses: {
        '200': jsonResponse('Güncellenen etiket.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
    delete: {
      tags: ['Labels'],
      summary: 'Etiket sil (member+).',
      operationId: 'deleteLabel',
      parameters: [idParam('labelId', 'Etiket id.'), refParam('IdempotencyKey')],
      responses: {
        '200': jsonResponse('Silme sonucu.', refSchema('Entity')),
        ...errorResponses({ badRequest: true, notFound: true }),
      },
    },
  },
};

// ---------------------------------------------------------------------------
//  DOCUMENT
// ---------------------------------------------------------------------------

export const openApiDocument: OpenApiDocument = {
  openapi: '3.1.0',
  info: {
    title: 'Pusula Public API',
    version: '1.0.0',
    description:
      'Bir panonun içerik işlemlerini (liste/kart CRUD + taşıma, checklist, yorum, etiket, ek, ' +
      'aktivite okuma) API key ile kimliklenen bir bot aktörüne açar. Kimlik: ' +
      '`Authorization: Bearer psk_…`. Tüm mutasyonlar `Idempotency-Key` (UUID) header\'ı ister. ' +
      'Hız sınırı key başına 120 istek/dk (aşımda 429 + Retry-After). Hatalar ' +
      '`{ error: { code, message, issues? } }` biçiminde döner.',
  },
  servers: [{ url: '/api/v1', description: 'Pusula Public API v1' }],
  security: [{ bearerAuth: [] }],
  tags: [
    { name: 'Meta', description: 'Key / bot meta bilgisi.' },
    { name: 'Board', description: 'Pano okuma uçları.' },
    { name: 'Lists', description: 'Liste CRUD + taşıma + arşiv.' },
    { name: 'Cards', description: 'Kart CRUD + taşıma / kopya / tamamla / arşiv.' },
    { name: 'Checklists', description: 'Checklist + madde CRUD.' },
    { name: 'Comments', description: 'Yorum CRUD (yalnız kendi yorumu düzenlenir).' },
    { name: 'Card members & labels', description: 'Kart üyesi + kart etiketi atama.' },
    { name: 'Attachments', description: 'İki-fazlı ek yükleme + indirme.' },
    { name: 'Labels', description: 'Pano etiket CRUD.' },
  ],
  paths,
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'psk_<43 char base64url>',
        description: 'Pano API anahtarı. Web UI: pano ayarları → API sekmesi.',
      },
    },
    parameters: {
      IdempotencyKey: {
        name: 'Idempotency-Key',
        in: 'header',
        required: true,
        schema: { type: 'string', format: 'uuid' },
        description:
          'Zorunlu UUID (tüm mutasyonlarda). `clientMutationId`\'ye map\'lenir; aynı ' +
          'anahtarla tekrar çift kayıt üretmez. Ayrıca 24 saat boyunca best-effort ' +
          'dedup: aynı anahtar + aynı gövde tekrarında ilk 2xx yanıt aynen replay ' +
          'edilir (`Idempotency-Replayed: true` başlığı). Aynı anahtar FARKLI gövdeyle ' +
          'kullanılırsa 409 `IDEMPOTENCY_KEY_REUSED`. Eksik / geçersiz → 400.',
      },
    },
    responses: {
      BadRequest: {
        description: 'Geçersiz istek (şema / eksik Idempotency-Key).',
        content: { 'application/json': { schema: refSchema('Error') } },
      },
      Unauthorized: {
        description: 'Eksik / geçersiz / iptal / süresi dolmuş API anahtarı.',
        content: { 'application/json': { schema: refSchema('Error') } },
      },
      Forbidden: {
        description: 'Yetersiz rol veya kaynak bu panoya ait değil.',
        content: { 'application/json': { schema: refSchema('Error') } },
      },
      NotFound: {
        description: 'Kaynak yok veya erişilemez.',
        content: { 'application/json': { schema: refSchema('Error') } },
      },
      TooManyRequests: {
        description: 'Hız sınırı aşıldı.',
        headers: {
          'Retry-After': {
            schema: { type: 'integer' },
            description: 'Yeniden denemeden önce beklenecek saniye.',
          },
        },
        content: { 'application/json': { schema: refSchema('Error') } },
      },
    },
    schemas: {
      Error: {
        type: 'object',
        required: ['error'],
        properties: {
          error: {
            type: 'object',
            required: ['code', 'message'],
            properties: {
              code: {
                type: 'string',
                description: 'Makine-okur hata kodu (UNAUTHORIZED, FORBIDDEN, NOT_FOUND, BAD_REQUEST, TOO_MANY_REQUESTS, …).',
              },
              message: { type: 'string', description: 'İnsan-okur açıklama.' },
              issues: {
                type: 'array',
                description: 'Zod alan hataları (yalnız 400\'de).',
                items: { type: 'object', additionalProperties: true },
              },
            },
          },
        },
      },
      RichTextInput: {
        oneOf: [{ type: 'string' }, { type: 'object', additionalProperties: true }],
        description:
          'Düz metin (server minimal Tiptap JSON\'a çevirir) VEYA Tiptap JSON dokümanı. ' +
          'Yeni format icat etme; düz metin göndermek yeterli.',
      },
      CardRole: {
        type: 'string',
        enum: ['assignee', 'watcher'],
        description: 'Kart üyelik rolü.',
      },
      Me: {
        type: 'object',
        properties: {
          bot: {
            type: 'object',
            properties: { id: { type: 'string' }, name: { type: 'string' } },
          },
          boardId: { type: 'string' },
          role: { type: 'string', enum: ['member', 'viewer'] },
          expiresAt: { type: ['string', 'null'], format: 'date-time' },
          createdAt: { type: 'string', format: 'date-time' },
        },
      },
      AttachmentInitiate: {
        type: 'object',
        description: 'Taslak ek satırı + doğrudan storage\'a yükleme için presigned PUT URL.',
        additionalProperties: true,
      },
      DownloadUrl: {
        type: 'object',
        description: 'Presigned GET URL (+ ek metadata).',
        additionalProperties: true,
      },
      Entity: {
        type: 'object',
        description: 'İlgili tRPC procedure çıktısı (Date alanları ISO string\'e serialize edilir).',
        additionalProperties: true,
      },
      EntityList: {
        type: 'array',
        description: 'Entity dizisi.',
        items: { type: 'object', additionalProperties: true },
      },
    },
  },
};
