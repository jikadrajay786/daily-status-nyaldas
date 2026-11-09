-- The company has only unpaid leave. The other types stop showing and stop earning credits, and new requests for them
-- are refused; they stay in the table because ledger lines point at them, and setting active back on restores them.
update public.leave_types set active = false where code in ('casual', 'sick', 'earned');
