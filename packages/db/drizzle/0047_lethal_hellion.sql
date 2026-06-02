-- Checklist madde yorumları — `comments.checklist_item_id` hedef boyutu.
--
-- Bir yorum ya doğrudan karta (`checklist_item_id IS NULL`, klasik kart
-- yorumu) ya da o kartın bir yapılacaklar maddesine aittir. `card_id` her
-- durumda doludur — permission, realtime room ve board sorgusu hep kart
-- üzerinden çalışır; bu kolon yalnızca thread'i madde altında gruplar. Madde
-- silinince yorumları cascade gider (kart yorum geçmişi etkilenmez).
--
-- Partial index madde thread'i (`checklist.list` badge sayacı + inline thread
-- sorgusu) içindir; kart-seviyesi yorumlar (`checklist_item_id IS NULL`) bu
-- index'i doldurmaz.
--
-- NOT: `db:generate` snapshot drift'i nedeniyle (0042–0046 elle yazılmış
-- migration'lar snapshot'a yansımamış) alakasız enum/constraint satırlarını
-- üretti; hepsi DB'de zaten mevcut olduğundan bu dosyadan çıkarıldı. 0047
-- snapshot'ı tam güncel şemayı yansıtır, sonraki generate'ler temizdir.
ALTER TABLE "comments" ADD COLUMN "checklist_item_id" text;--> statement-breakpoint
ALTER TABLE "comments" ADD CONSTRAINT "comments_checklist_item_id_checklist_items_id_fk" FOREIGN KEY ("checklist_item_id") REFERENCES "public"."checklist_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "comments_checklist_item_created_idx" ON "comments" USING btree ("checklist_item_id","created_at") WHERE "comments"."checklist_item_id" IS NOT NULL;
