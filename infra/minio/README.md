# MinIO infrastructure assets

`minio-setup` bootstrap servisleri (hem `docker-compose.yml` hem
`compose.prod.yml`) bu dizinden okur.

## `policies/pusula-app.json`

Application-level MinIO service account (`pusula-app`) policy'si. **Hem**
attachments bucket'ı (`pusula`) **hem** rapor render asset'leri bucket'ı
(`pusula-reports`) için RW + List yetkisi içerir.

- `s3:GetObject` / `PutObject` / `DeleteObject` → her iki bucket'ın `*`
- `s3:GetBucketLocation` / `ListBucket` → her iki bucket root'u

> **Neden bu dosya?** DEM-276 follow-up — Faz 13T deploy'unda manuel
> runbook adımı (`mc admin policy create`) atlandı; PDF render production'da
> 4 gün boyunca `storage_upload_failed` ile fail oldu. `minio-setup`
> servisi her deploy'da bu policy'yi `create` (overwrite OK) eder; manuel
> adım kalkar.

## Policy değiştirmek

1. `policies/pusula-app.json`'u düzenle (örn. yeni bucket eklenirse
   resource listesine ekle).
2. `git commit` → her deploy'da `minio-setup` yeniden uygular (modern
   `mc admin policy create` aynı isimde policy varsa overwrite eder).
3. Yeni bucket varsa `docker-compose.yml` / `compose.prod.yml`
   `minio-setup` entrypoint'inde `mc mb --ignore-existing local/<bucket>`
   satırı da eklenmeli.

## Backup

Mevcut MinIO'daki policy'yi inceleme/yedek:
```sh
mc admin policy info local pusula-app > pusula-app-backup.json
```

Restore (override):
```sh
mc admin policy create local pusula-app pusula-app-backup.json
```
