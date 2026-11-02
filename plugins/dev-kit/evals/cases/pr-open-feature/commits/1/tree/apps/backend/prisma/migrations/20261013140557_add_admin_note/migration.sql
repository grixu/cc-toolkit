CREATE TABLE "AdminNote" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT,
    "instanceNamespace" TEXT,
    "html" TEXT NOT NULL,
    "updatedBy" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminNote_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AdminNote_organizationId_key" ON "AdminNote"("organizationId");
CREATE UNIQUE INDEX "AdminNote_instanceNamespace_key" ON "AdminNote"("instanceNamespace");

ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AdminNote" ADD CONSTRAINT "AdminNote_instanceNamespace_fkey" FOREIGN KEY ("instanceNamespace") REFERENCES "Instance"("namespace") ON DELETE CASCADE ON UPDATE CASCADE;
