import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Search,
  Filter,
  Calendar,
  User,
  Building2,
  FileText,
  Activity,
  Eye,
  X,
  ChevronLeft,
  ChevronRight,
  Network,
  Fingerprint,
  ScrollText,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { formatIso } from '@/lib/date';
import { usersPickerQueryOptions, useAuditLogs, useBranches } from '../../queries';
import { useQuery } from '@tanstack/react-query';
import type { AuditLogRead } from '../../types';

const FILTER_ALL = 'all';

function auditUserLabel(log: AuditLogRead): string {
  return log.user_display_name?.trim() || log.user_email?.trim() || '—';
}

function auditBranchLabel(log: AuditLogRead): string {
  return log.branch_name?.trim() || '—';
}

export default function AuditLogsPage() {
  const { t } = useTranslation('admin');
  const { t: tc } = useTranslation('common');

  // Filters state
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [userId, setUserId] = useState<string>(FILTER_ALL);
  const [branchId, setBranchId] = useState<string>(FILTER_ALL);
  const [resourceType, setResourceType] = useState<string>(FILTER_ALL);
  const [action, setAction] = useState<string>('');
  const [resourceId, setResourceId] = useState<string>('');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [q, setQ] = useState<string>('');

  // Detail drawer state
  const [selectedLog, setSelectedLog] = useState<AuditLogRead | null>(null);

  // Data queries
  const filters = useMemo(
    () => ({
      page,
      page_size: pageSize,
      ...(userId !== FILTER_ALL ? { user_id: parseInt(userId) } : {}),
      ...(branchId !== FILTER_ALL ? { branch_id: parseInt(branchId) } : {}),
      ...(resourceType !== FILTER_ALL ? { resource_type: resourceType } : {}),
      ...(action ? { action } : {}),
      ...(resourceId ? { resource_id: resourceId } : {}),
      ...(dateFrom ? { date_from: new Date(dateFrom).toISOString() } : {}),
      ...(dateTo ? { date_to: new Date(dateTo).toISOString() } : {}),
      ...(q ? { q } : {}),
    }),
    [page, pageSize, userId, branchId, resourceType, action, resourceId, dateFrom, dateTo, q],
  );

  const { data: logsData, isLoading } = useAuditLogs(filters);
  const { data: branches = [] } = useBranches(false);
  const { data: users = [] } = useQuery(usersPickerQueryOptions());

  // Resource type options (common types)
  const resourceTypes = [
    { value: 'user', label: t('audit.resourceTypes.user') },
    { value: 'branch', label: t('audit.resourceTypes.branch') },
    { value: 'terminal', label: t('audit.resourceTypes.terminal') },
    { value: 'customer', label: t('audit.resourceTypes.customer') },
    { value: 'supplier', label: t('audit.resourceTypes.supplier') },
    { value: 'product', label: t('audit.resourceTypes.product') },
    { value: 'invoice', label: t('audit.resourceTypes.invoice') },
    { value: 'journal_entry', label: t('audit.resourceTypes.journalEntry') },
    { value: 'backup_job', label: t('audit.resourceTypes.backupJob') },
    { value: 'backup_file', label: t('audit.resourceTypes.backupFile') },
  ];

  const clearFilters = () => {
    setPage(1);
    setUserId(FILTER_ALL);
    setBranchId(FILTER_ALL);
    setResourceType(FILTER_ALL);
    setAction('');
    setResourceId('');
    setDateFrom('');
    setDateTo('');
    setQ('');
  };

  const hasFilters =
    userId !== FILTER_ALL ||
    branchId !== FILTER_ALL ||
    resourceType !== FILTER_ALL ||
    action ||
    resourceId ||
    dateFrom ||
    dateTo ||
    q;

  const formatJson = (value: unknown): string => {
    if (!value) return '';
    return JSON.stringify(value, null, 2);
  };

  return (
    <div className="p-4 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{t('audit.title')}</h1>
        <Button variant="outline" onClick={clearFilters} disabled={!hasFilters}>
          <X className="mr-2 h-4 w-4" />
          {t('audit.clearFilters')}
        </Button>
      </div>

      {/* Filters Card */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Filter className="h-5 w-5" />
            {t('audit.filters.title')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Search query */}
            <div className="space-y-2 sm:col-span-2 lg:col-span-4">
              <Label htmlFor="search">{t('audit.filters.search')}</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="search"
                  placeholder={t('audit.filters.searchPlaceholder')}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* User filter */}
            <div className="space-y-2">
              <Label htmlFor="user">{t('audit.filters.user')}</Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger id="user">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t('audit.filters.allUsers')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('audit.filters.allUsers')}</SelectItem>
                  {users.map((user) => (
                    <SelectItem key={user.id} value={String(user.id)}>
                      {user.display_name || user.email || `User #${user.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Branch filter */}
            <div className="space-y-2">
              <Label htmlFor="branch">{t('audit.filters.branch')}</Label>
              <Select value={branchId} onValueChange={setBranchId}>
                <SelectTrigger id="branch">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t('audit.filters.allBranches')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('audit.filters.allBranches')}</SelectItem>
                  {branches.map((branch) => (
                    <SelectItem key={branch.id} value={String(branch.id)}>
                      {branch.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Resource Type filter */}
            <div className="space-y-2">
              <Label htmlFor="resourceType">{t('audit.filters.resourceType')}</Label>
              <Select value={resourceType} onValueChange={setResourceType}>
                <SelectTrigger id="resourceType">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                    <SelectValue placeholder={t('audit.filters.allTypes')} />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={FILTER_ALL}>{t('audit.filters.allTypes')}</SelectItem>
                  {resourceTypes.map((type) => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Action filter */}
            <div className="space-y-2">
              <Label htmlFor="action">{t('audit.filters.action')}</Label>
              <div className="relative">
                <Activity className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="action"
                  placeholder={t('audit.filters.actionPlaceholder')}
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Resource ID filter */}
            <div className="space-y-2">
              <Label htmlFor="resourceId">{t('audit.filters.resourceId')}</Label>
              <Input
                id="resourceId"
                placeholder={t('audit.filters.resourceIdPlaceholder')}
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
              />
            </div>

            {/* Date from */}
            <div className="space-y-2">
              <Label htmlFor="dateFrom">{t('audit.filters.dateFrom')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="dateFrom"
                  type="datetime-local"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* Date to */}
            <div className="space-y-2">
              <Label htmlFor="dateTo">{t('audit.filters.dateTo')}</Label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  id="dateTo"
                  type="datetime-local"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Results Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('audit.results.title')}</CardTitle>
          <p className="text-muted-foreground text-sm">
            {t('audit.results.total', { total: logsData?.total ?? 0 })}
          </p>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{t('audit.col.time')}</TableHead>
                <TableHead>{t('audit.col.user')}</TableHead>
                <TableHead>{t('audit.col.action')}</TableHead>
                <TableHead>{t('audit.col.resource')}</TableHead>
                <TableHead>{t('audit.col.branch')}</TableHead>
                <TableHead className="w-[120px]">{t('audit.col.ip')}</TableHead>
                <TableHead className="w-[80px]">{t('audit.col.details')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8">
                    {t('loading')}
                  </TableCell>
                </TableRow>
              ) : logsData?.items.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                    {t('audit.results.empty')}
                  </TableCell>
                </TableRow>
              ) : (
                logsData?.items.map((log: AuditLogRead) => (
                  <TableRow key={log.id} className="cursor-pointer hover:bg-muted/50">
                    <TableCell className="font-mono text-sm">
                      {log.created_at ? formatIso(String(log.created_at), 'yyyy-MM-dd HH:mm:ss') : '—'}
                    </TableCell>
                    <TableCell>
                      {log.user_display_name ? (
                        <div>
                          <span className="font-medium">{log.user_display_name}</span>
                          {log.user_email && (
                            <span className="text-muted-foreground text-xs block">
                              {log.user_email}
                            </span>
                          )}
                        </div>
                      ) : (
                        <span className="text-muted-foreground">{auditUserLabel(log)}</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <code className="bg-muted px-2 py-1 rounded text-xs">{log.action}</code>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col">
                        <span className="text-xs text-muted-foreground">{log.resource_type}</span>
                        {log.resource_id && (
                          <span className="font-mono text-xs truncate max-w-[150px]">
                            {log.resource_id}
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{auditBranchLabel(log)}</TableCell>
                    <TableCell className="font-mono text-xs">{log.ip_address ?? '—'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setSelectedLog(log)}
                        title={t('audit.viewDetails')}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>

          {/* Pagination */}
          {logsData && logsData.total > 0 && (
            <div className="mt-4 flex items-center justify-between">
              <div className="flex items-center gap-4">
                <span className="text-muted-foreground text-sm">
                  {t('audit.pagination.page', { page, pages: logsData.pages })}
                </span>
                <div className="flex items-center gap-2">
                  <Label htmlFor="pageSize" className="text-sm text-muted-foreground">
                    {t('audit.pagination.pageSize')}
                  </Label>
                  <Select
                    value={String(pageSize)}
                    onValueChange={(v) => {
                      setPageSize(parseInt(v));
                      setPage(1);
                    }}
                  >
                    <SelectTrigger id="pageSize" className="w-[80px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="10">10</SelectItem>
                      <SelectItem value="20">20</SelectItem>
                      <SelectItem value="50">50</SelectItem>
                      <SelectItem value="100">100</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                >
                  <ChevronLeft className="mr-2 h-4 w-4" />
                  {t('pagination.prev')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => p + 1)}
                  disabled={page >= logsData.pages}
                >
                  {t('pagination.next')}
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Details Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={(open) => !open && setSelectedLog(null)}>
        <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ScrollText className="h-5 w-5" />
              {t('audit.details.title')}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6">
            {selectedLog && (
              <>
                {/* Basic info */}
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">
                        {t('audit.col.time')}
                      </Label>
                      <p className="font-mono text-sm">
                        {selectedLog.created_at
                          ? formatIso(String(selectedLog.created_at), 'yyyy-MM-dd HH:mm:ss')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">
                        {t('audit.col.action')}
                      </Label>
                      <p>
                        <code className="bg-muted px-2 py-1 rounded text-xs">
                          {selectedLog.action}
                        </code>
                      </p>
                    </div>
                  </div>

                  <div>
                    <Label className="text-muted-foreground text-xs">{t('audit.col.user')}</Label>
                    <p className="text-sm">
                      {selectedLog.user_display_name ?? auditUserLabel(selectedLog)}
                    </p>
                    {selectedLog.user_email && (
                      <p className="text-muted-foreground text-xs">{selectedLog.user_email}</p>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs">
                        {t('audit.col.resource')}
                      </Label>
                      <p className="text-sm">{selectedLog.resource_type}</p>
                      {selectedLog.resource_id && (
                        <p className="font-mono text-xs text-muted-foreground">
                          ID: {selectedLog.resource_id}
                        </p>
                      )}
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs">
                        {t('audit.col.branch')}
                      </Label>
                      <p className="text-sm">{auditBranchLabel(selectedLog)}</p>
                    </div>
                  </div>
                </div>

                {/* Technical details */}
                <div className="border-t pt-4 space-y-4">
                  <h4 className="font-medium text-sm flex items-center gap-2">
                    <Network className="h-4 w-4" />
                    {t('audit.details.technical')}
                  </h4>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label className="text-muted-foreground text-xs flex items-center gap-1">
                        <Network className="h-3 w-3" />
                        {t('audit.col.ip')}
                      </Label>
                      <p className="font-mono text-sm">{selectedLog.ip_address ?? '—'}</p>
                    </div>
                    <div>
                      <Label className="text-muted-foreground text-xs flex items-center gap-1">
                        <Fingerprint className="h-3 w-3" />
                        {t('audit.details.requestId')}
                      </Label>
                      <p className="font-mono text-xs">{selectedLog.request_id ?? '—'}</p>
                    </div>
                  </div>

                  {selectedLog.user_agent && (
                    <div>
                      <Label className="text-muted-foreground text-xs">{t('audit.details.userAgent')}</Label>
                      <p className="text-xs bg-muted p-2 rounded break-all">
                        {selectedLog.user_agent}
                      </p>
                    </div>
                  )}
                </div>

                {/* Values */}
                {(selectedLog.old_value || selectedLog.new_value) && (
                  <div className="border-t pt-4 space-y-4">
                    <h4 className="font-medium text-sm">{t('audit.details.changes')}</h4>

                    {selectedLog.old_value && (
                      <div>
                        <Label className="text-muted-foreground text-xs">
                          {t('audit.details.oldValue')}
                        </Label>
                        <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40 font-mono">
                          {formatJson(selectedLog.old_value)}
                        </pre>
                      </div>
                    )}

                    {selectedLog.new_value && (
                      <div>
                        <Label className="text-muted-foreground text-xs">
                          {t('audit.details.newValue')}
                        </Label>
                        <pre className="bg-muted p-2 rounded text-xs overflow-auto max-h-40 font-mono">
                          {formatJson(selectedLog.new_value)}
                        </pre>
                      </div>
                    )}
                  </div>
                )}

                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => setSelectedLog(null)}
                >
                  {tc('actions.close')}
                </Button>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
