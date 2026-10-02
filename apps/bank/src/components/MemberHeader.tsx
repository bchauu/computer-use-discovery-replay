import { dateLabel } from '../lib/data.ts';
import type { Member } from '../lib/data.ts';
import { Badge } from './Badge.tsx';

export function MemberHeader({ member }: { member: Member }) {
  return (
    <div className="member-strip">
      <span className="avatar">{member.initials}</span>
      <div>
        <strong>{member.name}</strong>
        <span>
          Member #{member.id} · Since {dateLabel(member.since)}
        </span>
      </div>
      <Badge>Verified · demo</Badge>
      <a href="#/members" className="switch-link">
        Change member
      </a>
    </div>
  );
}
