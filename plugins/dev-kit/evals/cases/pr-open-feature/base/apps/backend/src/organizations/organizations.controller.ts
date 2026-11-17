import { Controller, Get, Param } from '@nestjs/common';
import { RequirePermission } from '../authz/require-permission.decorator';
import { OrganizationsService } from './organizations.service';

@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly organizations: OrganizationsService) {}

  @Get(':organizationId')
  @RequirePermission('organization:read')
  get(@Param('organizationId') organizationId: string) {
    return this.organizations.get(organizationId);
  }
}
