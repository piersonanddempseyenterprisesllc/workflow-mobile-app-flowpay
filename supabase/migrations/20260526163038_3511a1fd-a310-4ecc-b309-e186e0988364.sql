
REVOKE EXECUTE ON FUNCTION public.send_money(uuid, numeric, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.approve_payment_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.decline_payment_request(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.share_schedule_with(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.block_user(uuid) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.send_money(uuid, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_payment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_payment_request(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.share_schedule_with(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_user(uuid) TO authenticated;
