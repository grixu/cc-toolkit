import { Injectable } from '@nestjs/common';
import sanitizeHtml from 'sanitize-html';
import { PrismaService } from '../prisma/prisma.service';

type Owner = { organizationId: string } | { instanceNamespace: string };

const ALLOWED = { allowedTags: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'a', 'br'], allowedAttributes: { a: ['href'] } };

@Injectable()
export class AdminNotesService {
  constructor(private readonly prisma: PrismaService) {}

  find(owner: Owner) {
    return this.prisma.adminNote.findUnique({ where: owner as never });
  }

  save(owner: Owner, html: string, updatedBy: string) {
    const clean = sanitizeHtml(html, ALLOWED);
    return this.prisma.adminNote.upsert({
      where: owner as never,
      create: { ...owner, html: clean, updatedBy },
      update: { html: clean, updatedBy },
    });
  }
}
