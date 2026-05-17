
ALTER TABLE public.friends
  ADD CONSTRAINT friends_friend_id_profiles_fkey FOREIGN KEY (friend_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.transactions
  ADD CONSTRAINT transactions_sender_profiles_fkey FOREIGN KEY (sender_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT transactions_receiver_profiles_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.payment_requests
  ADD CONSTRAINT payment_requests_requester_profiles_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT payment_requests_receiver_profiles_fkey FOREIGN KEY (receiver_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
ALTER TABLE public.schedule_access
  ADD CONSTRAINT schedule_access_viewer_profiles_fkey FOREIGN KEY (viewer_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE,
  ADD CONSTRAINT schedule_access_owner_profiles_fkey FOREIGN KEY (owner_user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;
