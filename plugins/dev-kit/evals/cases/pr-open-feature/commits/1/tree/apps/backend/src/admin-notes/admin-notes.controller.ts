import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import { RequirePermission } from '../authz/require-permission.decorator';
import { AdminNotesService } from './admin-notes.service';

@Controller()
export class AdminNotesController {
  constructor(private readonly notes: AdminNotesService) {}

  @Get('organizations/:organizationId/admin-note')
  @RequirePermission('admin:note:read')
  getForOrganization(@Param('organizationId') organizationId: string) {
    return this.notes.find({ organizationId });
  }

  @Put('organizations/:organizationId/admin-note')
  @RequirePermission('admin:note:write')
  putForOrganization(@Param('organizationId') organizationId: string, @Body('html') html: string, @Req() req) {
    return this.notes.save({ organizationId }, html, req.user.email);
  }

  @Get('instances/:namespace/admin-note')
  @RequirePermission('admin:note:read')
  getForInstance(@Param('namespace') namespace: string) {
    return this.notes.find({ instanceNamespace: namespace });
  }

  @Put('instances/:namespace/admin-note')
  @RequirePermission('admin:note:write')
  putForInstance(@Param('namespace') namespace: string, @Body('html') html: string, @Req() req) {
    return this.notes.save({ instanceNamespace: namespace }, html, req.user.email);
  }
}
