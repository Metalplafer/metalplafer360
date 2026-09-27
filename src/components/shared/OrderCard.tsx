import { Link } from 'react-router-dom';
import { CalendarDays, ChevronRight, MapPin } from 'lucide-react';
import { Badge } from '@/components/ui/Layout';
import { ORDER_STATUS_SHORT, ORDER_STATUS_TONE, ORDER_TYPE_LABEL } from '@/config/constants';
import { dayLabel, fmtHours, todayMadrid } from '@/lib/format';
import type { WorkOrder } from '@/types/db';

/** Tarjeta de una orden en el móvil del trabajador. */
export function OrderCard({ order, today = todayMadrid() }: { order: WorkOrder; today?: string }) {
  const future = order.scheduled_date > today;

  return (
    <Link className={`ot-card${future ? ' future' : ''}`} to={`/t/ordenes/${order.id}`}>
      <div className="ot-card-top">
        <span className="plate">{order.code}</span>
        <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_SHORT[order.status]}</Badge>
      </div>

      <strong className="ot-card-title">
        {ORDER_TYPE_LABEL[order.type]}
        {order.project ? ` · ${order.project.name}` : ''}
      </strong>

      <p className="ot-card-desc">{order.description}</p>

      <div className="ot-card-meta">
        <span><CalendarDays size={15} aria-hidden />{dayLabel(order.scheduled_date, today)}</span>
        {order.project?.address && <span><MapPin size={15} aria-hidden />{order.project.address}</span>}
        {order.planned_hours > 0 && <span className="num">{fmtHours(order.planned_hours)} previstas</span>}
      </div>

      <ChevronRight className="ot-card-go" aria-hidden />
    </Link>
  );
}
