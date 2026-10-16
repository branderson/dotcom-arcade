-- Flashpoint 14's database schema, the result of the migrations in
-- https://github.com/FlashpointProject/FPA-Rust (crates/flashpoint-archive),
-- Copyright (c) 2024 Flashpoint Archive, MIT License.

CREATE TABLE "additional_app" (
                "id"	varchar NOT NULL,
                "applicationPath"	varchar NOT NULL,
                "autoRunBefore"	boolean NOT NULL,
                "launchCommand"	varchar NOT NULL,
                "name"	varchar NOT NULL COLLATE NOCASE,
                "waitForExit"	boolean NOT NULL,
                "parentGameId"	varchar,
                PRIMARY KEY("id")
            );

CREATE TABLE "custom_id_order" (
                "id" VARCHAR NOT NULL
            );

CREATE TABLE ext_data (
                "extId" varchar NOT NULL,
                "gameId" varchar NOT NULL,
                "data" jsonb,
                PRIMARY KEY(extId, gameId)
            );

CREATE TABLE "game" (
                "id"	varchar NOT NULL,
                "parentGameId"	varchar,
                "title"	varchar NOT NULL,
                "alternateTitles"	varchar NOT NULL,
                "series"	varchar NOT NULL,
                "developer"	varchar NOT NULL,
                "publisher"	varchar NOT NULL,
                "dateAdded"	datetime NOT NULL,
                "dateModified"	datetime NOT NULL DEFAULT (datetime('now')),
                "broken"	boolean NOT NULL,
                "extreme"	boolean NOT NULL,
                "playMode"	varchar NOT NULL,
                "status"	varchar NOT NULL,
                "notes"	varchar NOT NULL,
                "source"	varchar NOT NULL,
                "applicationPath"	varchar NOT NULL,
                "launchCommand"	varchar NOT NULL,
                "releaseDate"	varchar NOT NULL,
                "version"	varchar NOT NULL,
                "originalDescription"	varchar NOT NULL,
                "language"	varchar NOT NULL,
                "library"	varchar NOT NULL,
                "orderTitle"	varchar NOT NULL,
                "activeDataId"	integer,
                "activeDataOnDisk"	boolean NOT NULL DEFAULT (0),
                "tagsStr"	varchar NOT NULL DEFAULT ('') COLLATE NOCASE,
                "platformsStr"	varchar,
                "platformId"	integer,
                "lastPlayed"	datetime,
                "playtime"	integer DEFAULT 0,
                "playCounter"	integer DEFAULT 0,
                "archiveState"	integer DEFAULT 2,
                "activeGameConfigId"	integer,
                "activeGameConfigOwner"	varchar COLLATE NOCASE, "platformName" varchar COLLATE NOCASE, "ruffleSupport" varchar NOT NULL DEFAULT '', "logoPath" varchar, "screenshotPath" varchar, "owner" varchar,
                PRIMARY KEY("id"),
                CONSTRAINT "FK_45a9180069d42ac8231ff11acd0" FOREIGN KEY("parentGameId") REFERENCES "game"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
            );

CREATE TABLE "game_config" (
                "id"	integer NOT NULL,
                "gameId"	varchar NOT NULL COLLATE NOCASE,
                "name"	varchar NOT NULL COLLATE NOCASE,
                "owner"	varchar NOT NULL COLLATE NOCASE,
                "middleware"	varchar,
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "game_data" (
            "id"	integer NOT NULL,
            "gameId"	varchar,
            "title"	varchar NOT NULL,
            "dateAdded"	datetime NOT NULL,
            "sha256"	varchar NOT NULL,
            "crc32"	integer NOT NULL,
            "presentOnDisk"	boolean NOT NULL DEFAULT (0),
            "path"	varchar,
            "size"	integer NOT NULL,
            "parameters"	varchar,
            "applicationPath"	varchar,
            "launchCommand"	varchar,
            PRIMARY KEY("id" AUTOINCREMENT),
            CONSTRAINT "UQ_gameid_dateadded" UNIQUE("gameId", "dateAdded"),
            CONSTRAINT "FK_gamedata_gameid" FOREIGN KEY("gameId") REFERENCES "game"("id") ON DELETE NO ACTION ON UPDATE NO ACTION
        );

CREATE TABLE "game_platforms_platform" (
                "gameId"	varchar NOT NULL,
                "platformId"	integer NOT NULL,
                PRIMARY KEY("gameId","platformId")
            );

CREATE TABLE "game_redirect" (
                "id" VARCHAR NOT NULL,
                "sourceId" VARCHAR NOT NULL,
                "dateAdded" datetime,
                PRIMARY KEY("id", "sourceId")
            );

CREATE TABLE "game_tags_tag" (
                "gameId"	varchar NOT NULL,
                "tagId"	integer NOT NULL,
                PRIMARY KEY("gameId","tagId")
            );

CREATE TABLE "platform" (
                "id"	integer NOT NULL,
                "dateModified"	datetime NOT NULL DEFAULT (datetime('now')),
                "primaryAliasId"	integer,
                "description" varchar NOT NULL DEFAULT '',
                CONSTRAINT "REL_platform_primary_alias_unique" UNIQUE("primaryAliasId"),
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "platform_alias" (
                "id"	integer NOT NULL,
                "platformId"	integer,
                "name"	varchar NOT NULL COLLATE NOCASE,
                CONSTRAINT "UQ_platform_alias_name_unique" UNIQUE("name"),
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "tag" (
                "id"	integer NOT NULL,
                "dateModified"	datetime NOT NULL DEFAULT (datetime('now')),
                "primaryAliasId"	integer,
                "categoryId"	integer,
                "description" varchar NOT NULL DEFAULT '',
                CONSTRAINT "REL_3c002904ab97fb1b4e61e8493c" UNIQUE("primaryAliasId"),
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "tag_alias" (
                "id"	integer NOT NULL,
                "tagId"	integer,
                "name"	varchar NOT NULL COLLATE NOCASE,
                CONSTRAINT "UQ_34d6ff6807129b3b193aea26789" UNIQUE("name"),
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "tag_category" (
                "id"	integer NOT NULL,
                "name"	varchar NOT NULL COLLATE NOCASE,
                "color"	varchar NOT NULL,
                "description"	varchar,
                CONSTRAINT "UQ_tag_category_name" UNIQUE("name"),
                PRIMARY KEY("id" AUTOINCREMENT)
            );

CREATE TABLE "tag_filter_index" (
                "id" VARCHAR NOT NULL,
                PRIMARY KEY("id")
            );

CREATE TABLE "tag_filter_index_info" (
                "key" VARCHAR NOT NULL, dirty INTEGER DEFAULT 1,
                PRIMARY KEY("key")
            );

CREATE INDEX "IDX_34d6ff6807129b3b193aea2678" ON "tag_alias" (
                "name"
            );

CREATE INDEX "IDX_6366e7093c3571f85f1b5ffd4f" ON "game_tags_tag" (
                "gameId"
            );

CREATE INDEX "IDX_d12253f0cbce01f030a9ced11d" ON "game_tags_tag" (
                "tagId"
            );

CREATE INDEX "IDX_ext_data_extId" ON "ext_data" (
                "extId"
            );

CREATE INDEX "IDX_ext_data_gameId" ON "ext_data" (
                "gameId"
            );

CREATE INDEX "IDX_gameTitle" ON "game" (
                "title"
            );

CREATE INDEX "IDX_game_activeDataId" ON "game" (
                "activeDataId"
            );

CREATE INDEX "IDX_game_config_game_id" ON "game_config" (
                "gameId"
            );

CREATE INDEX "IDX_lookup_dateAdded" ON "game" (
                "library",
                "dateAdded"
            );

CREATE INDEX "IDX_lookup_dateModified" ON "game" (
                "library",
                "dateModified"
            );

CREATE INDEX "IDX_lookup_developer" ON "game" (
                "library",
                "developer"
            );

CREATE INDEX "IDX_lookup_lastPlayed" ON "game" (
                "library",
                "lastPlayed"
            );

CREATE INDEX "IDX_lookup_playtime" ON "game" (
                "library",
                "playtime"
            );

CREATE INDEX "IDX_lookup_publisher" ON "game" (
                "library",
                "publisher"
            );

CREATE INDEX "IDX_lookup_series" ON "game" (
                "library",
                "series"
            );

CREATE INDEX "IDX_lookup_title" ON "game" (
                "library",
                "title"
            );

CREATE INDEX "IDX_redirect_sourceId" ON "game_redirect" (
            "sourceId"
        );

CREATE INDEX "IDX_total" ON "game" (
                "library",
                "broken",
                "extreme"
            );
