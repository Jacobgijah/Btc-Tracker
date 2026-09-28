-- CreateTable
CREATE TABLE "DailyPrice" (
    "id" SERIAL NOT NULL,
    "date" DATE NOT NULL,
    "btcUsd" DECIMAL(20,2) NOT NULL,
    "usdTzs" DECIMAL(14,4) NOT NULL,
    "btcSource" TEXT NOT NULL,
    "fxSource" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DailyPrice_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DailyPrice_date_key" ON "DailyPrice"("date");
