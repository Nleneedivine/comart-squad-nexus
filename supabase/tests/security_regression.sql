-- Rollback-safe security regression suite. Always ends with RAISE EXCEPTION so every
-- change made here (test users, stores, wallets...) is rolled back. Results are in the message.
DO $$
DECLARE
  ua uuid := gen_random_uuid(); ub uuid := gen_random_uuid(); uc uuid := gen_random_uuid();
  ud uuid := gen_random_uuid(); ue uuid := gen_random_uuid();
  sa uuid; sb uuid; cust_b uuid; prod_a uuid; prod_b uuid; ord_b uuid; sup_a uuid; po_a uuid; poi_a uuid;
  form_a uuid; per_a uuid; tok text; n int; ok boolean; j jsonb; t text; bal numeric; ref text;
  res text[] := '{}'; pass int := 0; fail int := 0; suite text;
BEGIN
  -- ---------- setup (as postgres) ----------
  INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (ua,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec_a_'||ua||'@test.local','{"store_name":"Sec A"}','{}',now(),now()),
         (ub,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec_b_'||ub||'@test.local','{"store_name":"Sec B"}','{}',now(),now()),
         (uc,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec_c_'||uc||'@test.local','{}','{}',now(),now());
  SELECT id INTO sa FROM public.stores WHERE owner_id = ua;
  SELECT id INTO sb FROM public.stores WHERE owner_id = ub;
  -- C becomes a sales rep in A (and is removed from his own personal store test-wise irrelevant)
  INSERT INTO public.user_roles(user_id, store_id, role) VALUES (uc, sa, 'sales_rep');
  INSERT INTO public.customers(store_id, name, phone) VALUES (sb, 'Cust B', '08000000001') RETURNING id INTO cust_b;
  INSERT INTO public.products(store_id, name, selling_price, stock_qty) VALUES (sa, 'Prod A', 1000, 0) RETURNING id INTO prod_a;
  INSERT INTO public.products(store_id, name, selling_price, stock_qty) VALUES (sb, 'Prod B', 500, 0) RETURNING id INTO prod_b;
  INSERT INTO public.orders(store_id, customer_name, amount, units) VALUES (sb, 'Cust B', 100, 1) RETURNING id INTO ord_b;
  INSERT INTO public.suppliers(store_id, name) VALUES (sa, 'Sup A') RETURNING id INTO sup_a;
  INSERT INTO public.purchase_orders(store_id, supplier_id, po_number) VALUES (sa, sup_a, 'PO-SEC-1') RETURNING id INTO po_a;
  INSERT INTO public.purchase_order_items(store_id, purchase_order_id, product_id, product_name, quantity)
    VALUES (sa, po_a, prod_a, 'Prod A', 5) RETURNING id INTO poi_a;
  INSERT INTO public.sales_forms(store_id, title, slug, status, product_ids)
    VALUES (sa, 'Sec form', 'sec-form-'||left(ua::text,8), 'active', ARRAY[prod_a]) RETURNING id INTO form_a;
  INSERT INTO public.payroll_periods(store_id, name, period_start, period_end) VALUES (sa, 'Sec period', current_date-30, current_date) RETURNING id INTO per_a;
  UPDATE public.whatsapp_integrations SET status = status WHERE false;
  INSERT INTO public.whatsapp_integrations(store_id, access_token_encrypted, webhook_verify_token, status) VALUES (sa, 'SECRET_TOKEN', 'VERIFY_TOKEN', 'connected');

  -- =============== B. tenant isolation (user A vs store B) ===============
  suite := 'B';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.customers WHERE store_id = sb;          ok := n = 0; res := res || (suite||':A_select_B_customers:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.orders WHERE store_id = sb;             ok := n = 0; res := res || (suite||':A_select_B_orders:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.products WHERE store_id = sb;           ok := n = 0; res := res || (suite||':A_select_B_products:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.stores WHERE id = sb;                   ok := n = 0; res := res || (suite||':A_select_B_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.user_roles WHERE store_id = sb;         ok := n = 0; res := res || (suite||':A_select_B_roles:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN INSERT INTO public.customers(store_id,name,phone) VALUES (sb,'x','1'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':A_insert_B_customer:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  UPDATE public.customers SET name='hacked' WHERE id = cust_b; GET DIAGNOSTICS n = ROW_COUNT; ok := n=0;
  res := res || (suite||':A_update_B_customer:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  DELETE FROM public.orders WHERE id = ord_b; GET DIAGNOSTICS n = ROW_COUNT; ok := n=0;
  res := res || (suite||':A_delete_B_order:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.wallet_ensure(sb); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':A_rpc_wallet_B:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.get_store_members_detail(sb); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':A_rpc_members_B:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  ok := NOT public.has_permission(sb, 'orders.view'); res := res || (suite||':A_owner_perm_not_global:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  ok := NOT public.is_store_admin(ub, sb); res := res || (suite||':helper_cannot_probe_other_user:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ub,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.products WHERE store_id = sa;           ok := n = 0; res := res || (suite||':B_select_A_products:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.customers WHERE store_id = sb;          ok := n = 1; res := res || (suite||':B_sees_own_customer:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';

  -- =============== C. role escalation ===============
  suite := 'C';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uc,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN INSERT INTO public.user_roles(user_id,store_id,role) VALUES (uc,sa,'admin'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_direct_insert_admin_role:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  UPDATE public.user_roles SET role='owner' WHERE user_id=uc; GET DIAGNOSTICS n = ROW_COUNT; ok := n=0;
  res := res || (suite||':rep_direct_update_role:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.staff_assign_role(sa, uc, 'admin'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_rpc_self_assign:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.staff_set_suspended(sa, ua, true); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_suspend_owner:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN INSERT INTO public.staff_invites(store_id,email,role,invited_by,expires_at) VALUES (sa,'x@y.z','admin',uc,now()+interval '1 day'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_create_invite:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.orders WHERE store_id = sa; ok := n = 0;
  res := res || (suite||':rep_cannot_see_unassigned_orders:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.staff_assign_role(sa, ua, 'admin'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':owner_self_modify_denied:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.staff_assign_role(sa, uc, 'owner'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':owner_role_not_assignable:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.staff_assign_role(sa, uc, 'manager'); ok:=true; EXCEPTION WHEN others THEN ok:=false; END;
  res := res || (suite||':owner_can_assign_manager:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN UPDATE public.stores SET owner_id = uc WHERE id = sa; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':owner_cannot_change_owner_id:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN UPDATE public.stores SET status = 'suspended' WHERE id = sa; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':owner_cannot_change_status:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  -- manager (C now) cannot grant admin or touch owner
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uc,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.staff_assign_role(sa, ua, 'admin'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':manager_cannot_modify_owner:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN INSERT INTO public.staff_invites(store_id,email,role,invited_by,expires_at) VALUES (sa,'z@y.z','admin',uc,now()+interval '1 day'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':manager_cannot_invite_admin:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  DELETE FROM public.user_roles WHERE user_id = uc AND store_id = sa AND role = 'manager';

  -- =============== D. active-store spoofing ===============
  suite := 'D';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.set_active_store(sb); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rpc_set_foreign_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN UPDATE public.profiles SET active_store_id = sb WHERE id = ua; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':direct_set_foreign_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.set_active_store(sa); ok:=true; EXCEPTION WHEN others THEN ok:=false; END;
  res := res || (suite||':set_own_store_ok:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';

  -- =============== E/F/G. wallet ===============
  suite := 'E';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.wallet_ensure(sa);
  j := public.wallet_set_pin(sa, '1234', NULL); ok := (j->>'ok')::boolean;
  res := res || (suite||':set_pin:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN EXECUTE 'SELECT pin_hash FROM public.wallets LIMIT 1'; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':pin_hash_not_selectable:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN UPDATE public.wallets SET balance = 999999 WHERE store_id = sa; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':balance_not_writable:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN INSERT INTO public.wallet_transactions(store_id,wallet_id,kind,amount,status) SELECT sa,id,'funding',5000,'success' FROM public.wallets WHERE store_id=sa; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':tx_not_insertable:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.wallet_settle_transaction('fund_x', true, NULL); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':settle_denied_to_authenticated:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  j := public.wallet_update_bank(sa, 'Test Bank', '0123456789', 'Sec A', '0000'); ok := NOT (j->>'ok')::boolean;
  res := res || (suite||':bank_change_wrong_pin_denied:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  j := public.wallet_update_bank(sa, 'Test Bank', '0123456789', 'Sec A', '1234'); ok := (j->>'ok')::boolean;
  res := res || (suite||':bank_change_correct_pin:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  FOR n IN 1..5 LOOP j := public.wallet_update_bank(sa, 'Test Bank', '0123456789', 'Sec A', '9999'); END LOOP;
  j := public.wallet_update_bank(sa, 'Test Bank', '0123456789', 'Sec A', '1234'); ok := (j->>'error') ILIKE '%locked%';
  res := res || (suite||':pin_lockout_after_5:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  SELECT pin_hash LIKE '$2%' INTO ok FROM public.wallets WHERE store_id = sa;
  res := res || (suite||':pin_is_bcrypt:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  UPDATE public.wallets SET pin_locked_until = NULL, pin_failed_attempts = 0 WHERE store_id = sa;
  -- accountant has wallet.view but not wallet.withdraw
  ok := NOT public.role_grants('accountant','wallet.withdraw') AND public.role_grants('accountant','wallet.view');
  res := res || (suite||':accountant_view_not_withdraw:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  suite := 'F';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  ref := 'fund_sectest_' || replace(left(ua::text, 8), '-', '');
  PERFORM public.wallet_create_funding(sa, 500, ref);
  BEGIN PERFORM public.wallet_create_funding(sa, 500, ref); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':duplicate_reference_rejected:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.wallet_create_funding(sb, 500, ref||'b'); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':fund_foreign_store_denied:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  j := public.wallet_settle_transaction(ref, true, 400); ok := (j->>'error') = 'amount_mismatch';
  res := res || (suite||':amount_mismatch_rejected:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  SELECT balance INTO bal FROM public.wallets WHERE store_id = sa; ok := bal = 0;
  res := res || (suite||':mismatch_not_credited:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  ref := ref || 'x2';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  PERFORM public.wallet_create_funding(sa, 1000, ref);
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.wallet_settle_transaction(ref, true, 1000);
  PERFORM public.wallet_settle_transaction(ref, true, 1000);
  PERFORM public.wallet_settle_transaction(ref, true, 1000);
  EXECUTE 'RESET ROLE';
  SELECT balance INTO bal FROM public.wallets WHERE store_id = sa; ok := bal = 1000;
  res := res || (suite||':triple_settle_credits_once:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  suite := 'G';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  j := public.wallet_request_withdrawal(sa, 700, '1234', 'idem-key-0001'); ok := (j->>'ok')::boolean;
  res := res || (suite||':withdraw_ok:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  t := j->>'reference';
  j := public.wallet_request_withdrawal(sa, 700, '1234', 'idem-key-0001'); ok := (j->>'duplicate')::boolean AND (j->>'reference') = t;
  res := res || (suite||':same_idempotency_key_no_double_debit:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  j := public.wallet_request_withdrawal(sa, 700, '1234', 'idem-key-0002'); ok := (j->>'error') = 'Insufficient balance';
  res := res || (suite||':second_withdraw_overdraft_blocked:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  SELECT balance INTO bal FROM public.wallets WHERE store_id = sa; ok := bal = 300;
  res := res || (suite||':balance_after_withdraw_300:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('role','service_role')::text, true);
  EXECUTE 'SET LOCAL ROLE service_role';
  PERFORM public.wallet_settle_transaction(t, false, NULL);
  PERFORM public.wallet_settle_transaction(t, false, NULL);
  EXECUTE 'RESET ROLE';
  SELECT balance INTO bal FROM public.wallets WHERE store_id = sa; ok := bal = 1000;
  res := res || (suite||':failed_withdraw_refunded_once:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT position('FOR UPDATE' in pg_get_functiondef('public._wallet_for_update(uuid)'::regprocedure)) > 0 INTO ok;
  res := res || (suite||':wallet_row_lock_present:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  -- =============== H. invites ===============
  suite := 'H';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  INSERT INTO public.staff_invites(store_id,email,role,invited_by,expires_at) VALUES (sa,'sec_d_'||ud||'@test.local','sales_rep',ua,now()+interval '1 day') RETURNING token INTO tok;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ub,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  SELECT count(*) INTO n FROM public.staff_invites; ok := n = 0;
  res := res || (suite||':other_store_cannot_list_invites:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.accept_staff_invite(tok); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':wrong_email_cannot_accept:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  EXECUTE 'SET LOCAL ROLE anon';
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  BEGIN SELECT count(*) INTO n FROM public.staff_invites; ok := n = 0; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_cannot_list_invites:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  j := public.get_invite_by_token(tok); ok := j ? 'email' AND NOT j ? 'store_id' AND NOT j ? 'id';
  res := res || (suite||':token_lookup_minimal_fields:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  ok := public.get_invite_by_token('short') IS NULL;
  res := res || (suite||':short_token_rejected:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  -- invited signup joins invited store, no personal store
  INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (ud,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec_d_'||ud||'@test.local',json_build_object('invite_token',tok),'{}',now(),now());
  SELECT count(*) INTO n FROM public.stores WHERE owner_id = ud; ok := n = 0;
  res := res || (suite||':invited_user_no_personal_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM public.user_roles WHERE user_id = ud AND store_id = sa AND role='sales_rep'; ok := n = 1;
  res := res || (suite||':invited_user_joined_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  -- expired-invite user also gets no personal store
  INSERT INTO public.staff_invites(store_id,email,role,invited_by,expires_at,status) VALUES (sa,'sec_e_'||ue||'@test.local','sales_rep',ua,now()-interval '1 day','pending');
  INSERT INTO auth.users(id, instance_id, aud, role, email, raw_user_meta_data, raw_app_meta_data, created_at, updated_at)
  VALUES (ue,'00000000-0000-0000-0000-000000000000','authenticated','authenticated','sec_e_'||ue||'@test.local','{}','{}',now(),now());
  SELECT count(*) INTO n FROM public.stores WHERE owner_id = ue; ok := n = 0;
  res := res || (suite||':expired_invite_no_personal_store:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT position('divinenlenee' in pg_get_functiondef('public.handle_new_user()'::regprocedure)) = 0 INTO ok;
  res := res || (suite||':no_email_backdoor:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  -- =============== I. anonymous public form ===============
  suite := 'I';
  PERFORM set_config('request.jwt.claims', json_build_object('role','anon')::text, true);
  EXECUTE 'SET LOCAL ROLE anon';
  BEGIN SELECT count(*) INTO n FROM public.customers; ok := false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_customers:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN SELECT count(*) INTO n FROM public.orders; ok := false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_orders:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN SELECT count(*) INTO n FROM public.products; ok := false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_products:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN SELECT count(*) INTO n FROM public.stores; ok := false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_stores:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN INSERT INTO public.orders(store_id, amount, units) VALUES (sa, 1, 1); ok := false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_direct_order_insert:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  j := public.get_public_sales_form('sec-form-'||left(ua::text,8)); ok := jsonb_array_length(j->'products') = 1;
  res := res || (suite||':anon_loads_form_products_only:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  t := public.submit_sales_form(form_a, '{"customer_name":"Anon Buyer","customer_phone":"08011112222"}',
        jsonb_build_array(jsonb_build_object('product_id',prod_a,'quantity',2,'unit_price',1,'subtotal',1)));
  ok := t LIKE 'ORD-%'; res := res || (suite||':anon_submit_ok:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.submit_sales_form(form_a, '{"customer_name":"Anon","customer_phone":"08011112222"}', jsonb_build_array(jsonb_build_object('product_id',prod_b,'quantity',1))); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_cannot_order_other_store_product:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.wallet_ensure(sa); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':anon_no_private_rpc:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  SELECT amount = 2000 INTO ok FROM public.orders WHERE order_number = t;
  res := res || (suite||':price_tamper_ignored_total_2000:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  -- =============== J. secrets ===============
  suite := 'J';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN EXECUTE 'SELECT access_token_encrypted FROM public.whatsapp_integrations LIMIT 1'; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':wa_access_token_hidden_even_from_owner:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN EXECUTE 'SELECT webhook_verify_token FROM public.whatsapp_integrations LIMIT 1'; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':wa_verify_token_hidden:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN EXECUTE 'SELECT api_key FROM public.store_integrations LIMIT 1'; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':integration_api_key_hidden:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN EXECUTE 'SELECT webhook_secret FROM public.stores LIMIT 1'; ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':store_webhook_secret_hidden:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.get_store_webhook_secret(sa); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':get_webhook_secret_rpc_denied:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  t := public.rotate_store_webhook_secret(sa); ok := length(t) = 48;
  res := res || (suite||':rotate_secret_returns_once:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';

  -- =============== K. EXECUTE audit ===============
  suite := 'K';
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND p.proname NOT IN ('get_public_sales_form','submit_sales_form','get_invite_by_token');
  ok := n = 0; res := res || (suite||':anon_exec_only_public_rpcs(extra='||n||'):'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prosecdef
    AND NOT EXISTS (SELECT 1 FROM unnest(coalesce(p.proconfig,'{}')) c WHERE c LIKE 'search_path=%');
  ok := n = 0; res := res || (suite||':all_definer_fns_have_search_path(missing='||n||'):'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND (p.proname LIKE 'tg\_%' OR p.proname IN ('handle_new_user','wallet_settle_transaction','record_payment_event','auto_assign_order',
      'advance_subscription_lifecycle','expire_stale_orders','expire_feature_overrides','generate_daily_reports','get_store_webhook_secret',
      '_wallet_for_update','_wallet_check_pin','compute_subscription_amount'));
  ok := n = 0; res := res || (suite||':internal_fns_not_exec_by_authenticated(count='||n||'):'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  SELECT count(*) INTO n FROM pg_policies WHERE schemaname='public' AND (roles @> '{public}' OR roles @> '{anon}');
  ok := n = 0; res := res || (suite||':no_public_or_anon_policies(count='||n||'):'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.superadmin_delete_store(sb); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':superadmin_delete_denied_to_owner:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';

  -- =============== L. stock receiving ===============
  suite := 'L';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uc,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.receive_purchase_order_items(po_a, jsonb_build_array(jsonb_build_object('id',poi_a,'received',1))); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_cannot_receive:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.receive_purchase_order_items(po_a, jsonb_build_array(jsonb_build_object('id',poi_a,'received',6))); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':over_receive_rejected:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.receive_purchase_order_items(po_a, jsonb_build_array(jsonb_build_object('id',poi_a,'received',5))); ok:=true; EXCEPTION WHEN others THEN ok:=false; END;
  res := res || (suite||':exact_receive_ok:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  SELECT stock_qty = 5 INTO ok FROM public.products WHERE id = prod_a;
  res := res || (suite||':stock_incremented_5:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  -- =============== M. payroll ===============
  suite := 'M';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',uc,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.generate_payslips(per_a); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_cannot_generate_payslips:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  BEGIN PERFORM public.mark_payroll_paid(per_a); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':rep_cannot_mark_paid:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ub,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.generate_payslips(per_a); ok:=false; EXCEPTION WHEN others THEN ok:=true; END;
  res := res || (suite||':other_store_owner_cannot_generate:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  PERFORM set_config('request.jwt.claims', json_build_object('sub',ua,'role','authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  BEGIN PERFORM public.generate_payslips(per_a); ok:=true; EXCEPTION WHEN others THEN ok:=false; t := SQLERRM; END;
  res := res || (suite||':owner_can_generate:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;
  EXECUTE 'RESET ROLE';
  ok := public.role_grants('hr','payroll.manage') AND NOT public.role_grants('sales_rep','payroll.manage');
  res := res || (suite||':hr_has_payroll_manage:'||ok); IF ok THEN pass:=pass+1; ELSE fail:=fail+1; END IF;

  RAISE EXCEPTION 'TEST_RESULTS pass=% fail=% | %', pass, fail, array_to_string(res, ' | ');
END $$;
