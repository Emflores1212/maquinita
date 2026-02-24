import ModulePlaceholder from '@/components/pages/ModulePlaceholder';
import { PermissionGuardWithDenied } from '@/components/auth/PermissionGuard';

export default function SettingsPage() {
  return (
    <PermissionGuardWithDenied module="settings" action="r">
      <ModulePlaceholder titleKey="settings" />
    </PermissionGuardWithDenied>
  );
}
