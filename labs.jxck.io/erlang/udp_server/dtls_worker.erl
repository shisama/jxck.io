-module(dtls_worker).
-behaviour(gen_statem).
-mode(compile).
-compile(export_all).
-include("../logger.hrl").

-define(TIMEOUT, 3000).

%%====================================================================
%% API functions
%%====================================================================
start_link(#{}, #{socket := Socket}) ->
    ?Log(Socket),
    Name = main:name_from_port(?MODULE, Socket),
    ?Log(gen_statem:start_link({local, Name}, ?MODULE, #{socket => Socket}, [])).

stop(Pid) ->
    ?Log(gen_statem:stop(Pid)).


%%====================================================================
%% Behaviour callbacks
%%====================================================================
init(State) ->
    process_flag(trap_exit, true),
    ?Log(State),
    {ok, listening, State}.

callback_mode() ->
    state_functions.


listening(timeout, ?TIMEOUT, State) ->
    {stop, {shutdown, timeout}};

listening(cast, <<"dtls\n">>, State) ->
    ?Log(received, dtls),
    {keep_state_and_data, ?TIMEOUT};



listening(cast, dtls, State) ->
    ?Log(received, dtls),
    keep_state_and_data.

terminate(Reason, StateName, State) ->
    ?Log(Reason, StateName, State),
    ok.


%%====================================================================
%% Internal functions
%%====================================================================
