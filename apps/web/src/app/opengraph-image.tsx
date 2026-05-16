import { ImageResponse } from 'next/og';

/**
 * Link önizleme görseli (WhatsApp, Slack, X, vb.). Next.js bu dosyayı tüm
 * route'lar için og:image / twitter:image olarak otomatik bağlar.
 *
 * Tasarım, giriş ekranındaki `AuthBrandPanel` ile aynı dili konuşur: indigo
 * degrade zemin, pusula ikonu ve kısa tanıtım metni. Renkler `theme.css`
 * `--primary` (oklch) değerinin sRGB karşılığıdır — Satori oklch desteklemez.
 */

export const alt = 'Pusula — Görev ve Pano Yönetimi';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const HEADLINE = 'Ekibinizin işlerini tek yönde toplayın.';
const EYEBROW = 'GÖREV VE PANO YÖNETİMİ';

/** Google Fonts'tan Inter alt kümesi (TTF) çeker — Türkçe glifler için. */
async function loadInter(weight: 400 | 700, text: string): Promise<ArrayBuffer> {
  const url = `https://fonts.googleapis.com/css2?family=Inter:wght@${weight}&text=${encodeURIComponent(text)}`;
  const css = await (await fetch(url)).text();
  const match = css.match(/src: url\((.+?)\) format\('(?:opentype|truetype)'\)/);
  const fontUrl = match?.[1];
  if (!fontUrl) throw new Error('Inter font kaynağı çözümlenemedi');
  return (await fetch(fontUrl)).arrayBuffer();
}

export default async function OpengraphImage() {
  const glyphs = `${HEADLINE}${EYEBROW}Pusulapusulaportal.com`;
  const [regular, bold] = await Promise.all([loadInter(400, glyphs), loadInter(700, glyphs)]);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '80px',
          color: '#ffffff',
          backgroundColor: '#5a66d6',
          backgroundImage:
            'radial-gradient(circle at 18% 12%, rgba(148,156,228,0.55) 0%, rgba(90,102,214,0) 55%), radial-gradient(circle at 85% 88%, rgba(31,36,80,0.85) 0%, rgba(90,102,214,0) 60%), linear-gradient(135deg, #5a66d6 0%, #3f4796 100%)',
          fontFamily: 'Inter',
        }}
      >
        {/* Marka satırı: pusula ikonu + sözcük işareti */}
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '92px',
              height: '92px',
              borderRadius: '24px',
              backgroundColor: 'rgba(255,255,255,0.14)',
              border: '1px solid rgba(255,255,255,0.22)',
            }}
          >
            <svg width="52" height="52" viewBox="0 0 32 32" fill="#ffffff">
              <path d="M16 0C7.164 0 0 7.164 0 16s7.164 16 16 16 16-7.164 16-16S24.836 0 16 0zm7.848 9.53-2.324 3.724-1.55 2.484c.006.088.026.172.026.262 0 2.21-1.79 4-4 4-.09 0-.174-.02-.262-.026l-2.486 1.55-3.722 2.324a1.006 1.006 0 0 1-1.238-.14.996.996 0 0 1-.14-1.236l2.324-3.724 1.55-2.484C12.02 16.174 12 16.09 12 16c0-2.21 1.79-4 4-4 .09 0 .174.02.262.026l2.486-1.55 3.722-2.324a1 1 0 0 1 1.236.142c.332.328.39.84.142 1.236zM14 16a2 2 1080 1 0 4 0 2 2 1080 1 0-4 0z" />
            </svg>
          </div>
          <span style={{ marginLeft: '28px', fontSize: '56px', fontWeight: 700 }}>Pusula</span>
        </div>

        {/* Başlık bloğu */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <span
            style={{
              fontSize: '26px',
              fontWeight: 700,
              letterSpacing: '4px',
              color: 'rgba(255,255,255,0.7)',
            }}
          >
            {EYEBROW}
          </span>
          <span
            style={{
              marginTop: '24px',
              fontSize: '76px',
              fontWeight: 700,
              lineHeight: 1.15,
              maxWidth: '900px',
            }}
          >
            {HEADLINE}
          </span>
        </div>

        {/* Alt satır: alan adı */}
        <span style={{ fontSize: '30px', color: 'rgba(255,255,255,0.65)' }}>pusulaportal.com</span>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: 'Inter', data: regular, weight: 400, style: 'normal' },
        { name: 'Inter', data: bold, weight: 700, style: 'normal' },
      ],
    },
  );
}
