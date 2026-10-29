## SETUP

In the router's web interface (System Settings > Router System Settings > Port Settings):

- In the TCP/IP section set "Default Function" to "Crosspoint remote control 2"
- In the Command Response section make sure that Echo, C and S responses are checked
- Send changes in order to save them to the system

The module waits for the router to echo each command before sending the next, as the router requires. Echo must be enabled; if it is not, commands are paced by a 500ms timeout and startup is slow.

## HOW IT WORKS

Select a destination, then a source, then press a cut or preset button. The module learns the router's size, port names, crosspoints and destination locks on connect and keeps them current from the router's S and W responses.

The router's lowest level that responds to a system size request is the one controlled.

## VARIABLES

- `id` router unit ID (from the active CPU)
- `level` crosspoint level in use
- `outputs`, `inputs` number of destinations and sources
- `dst##` name of each destination
- `src##` name of each source
- `xpt##` hex id of the source routed to each destination
- `dst##_locked` lock mode of each destination (0 unlocked, 1 locked, 2 locked by others)
- `selected_dst_id`, `selected_dst_name` the selected destination
- `selected_dst_src_id`, `selected_dst_src_name` the source routed to the selected destination
- `selected_src_id`, `selected_src_name` the selected source
- `active_selected_id`, `active_selected_name`, `active_selected_type` the most recent selection (`src` or `dst`)

Selection variables are empty when nothing is selected, and are cleared after a cut.

## ACTIONS

- Set destination / Set source: make a selection
- Cut selected source to selected destination
- Preset selected source to selected destination
- Switch preset crosspoint(s): perform all preset crosspoints together
- Preset / Apply / Cancel video format (with reference and switching point)
- Rename a destination or source
- Lock / unlock a destination

Operator actions are sent ahead of the module's own startup reads, but never interrupt a command already waiting for its echo.

## FEEDBACKS

- Selected destination / Selected source: this port is selected. The destination blinks while a source is also selected.
- Routed source: this source is routed to the selected destination
- Routed destination: this destination carries the selected source
- Locked destination: this destination is locked

## PRESETS

- Control: cut, preset, salvo switch, video format, rename and lock buttons
- Destinations: a button per destination with select, routed, selected and locked feedback
- Sources: a button per source with select, routed and selected feedback

Not implemented: reinitialize unit, reading back the video format, "lock others" mode.

## COMMAND REFERENCE

## For.A MFR Series 3G/HD/SD/ASI Routing Switchers

     * Basic specification
         -   Port number 49152 - 65534 (default : 23)
         -   Maximum clients : 16
         -   Wait for Echo before sending next command
         -   No password required

## Commands available by connecting using LAN

\*1 When commands are sent via LAN, an Echo, Prompt, S response and other response messages may be included in a single packet or divided into two or more packets. Therefore, do not process commands in a per packet basis but a per stream basis.

\*2 A command protocol should be selected in the [Web-based Control: Port Settings page].

If "Crosspoint remote control 2" is not enabled some functionality is not available.

     *2  To enable "Crosspoint remote control 2" commands
         -   navigate to the switcher's web interface;
             System Settings > Router System Settings > Port Settings
         -   In the TCP/IP section set "Default Function" to "Crosspoint remote control 2"
         -   In the Command Response section make sure that Echo, C and S responses are checked
         -   Send changes in order to save changes to system

## Control command list

## Crosspoint remote control / Crosspoint remote control 2

1.  Commands (S?) for requesting the crosspoints list

        - Control command   =>  @[sp]S?<Lvl>
        - Command response  <=  S:<Lvl><Dest>,<Src>

2.  Commands (X?) for requesting information on crosspoints (by specifying a destination and level.)

        - Control command   =>  @[sp]X?<Lvl><Dest>
        - Command response  <=  S:<Lvl><Dest>,<Src>

3.  Commands (X:) for switching over a crosspoint (single channel)

        - Control command   =>  @[sp]X:<Lvls>/<Dest>,<Src>
        - Command response  <=  S:<Lvl><Dest>,<Src>
                            <=  C:<Lvls>/<Dest>,<Src>[.....[S<Salvo number>][L<Link number>]]:I<ID>

4.  Commands for switching over crosspoints (multi-channel simultaneous switchover)

         - Control command
             Clear a preset crosspoint.  =>  @[sp]B:C
         - Command response

         - Control command
             Preset a crosspoint.    =>  @[sp]P:<Lvl>/<Dest>,<Src>
         - Command response

         - Control command
             Read a preset crosspoint specifying a level and destination.    =>  @[sp]P?<Lvl><Dest>
         - Command response  <=  V:<Lvl><Dest>,<Src>

         - Control command
             Read preset crosspoints for all channels in the specified level.    =>  @[sp]V?<Lvl>
         - Command response  <=  V:<Lvl><Dest>,<Src>

         - Control command
             Perform the preset crosspoints simultaneously.  =>  @[sp]B:E
         - Command response  <=  S:<Lvl><Dest>,<Src>
                             <=  C:<Lvls>/<Dest>,<Src>[.....[S<Salvo number>][L<Link number>]]:I<ID>

5.  Commands (W:) for locking a destination

        - Control command
            LOCK ALL units. =>  @[sp]W:<Lvl>/<Dest>,<ID>,1
        - Command response
                            <=  W!<Lvl><Dest>,<ID>,1

        - Control command
            LOCK OTHER units.   =>  @[sp]W:<Lvl>/<Dest>,<ID>,2
        - Command response
                            <=  W!<Lvl><Dest>,<ID>,2

        - Control command
            Disable LOCK.   =>  @[sp]W:<Lvl>/<Dest>,<ID>,0
        - Command response
                            <=  W!<Lvl><Dest>,<ID>,0

6.  Commands (Z:) for reinitializing a unit

         - Control command   =>  @[sp]Z:<Lvls>
         - Command response  <=  S:<Lvl><Dest>,<Src>
                             <=    C:<Lvls>/<Dest>,<Src>[.....[S<Number of crosspoints in Salvo>][L<Number of Links>]]:I<ID>

7.  Commands (F?) for requesting System Size

        - Control command   =>  @[sp]F?<Lvl>
        - Command response  <=  F:<Lvl><Dst Size>,<Src Size>/< Dst Size >,<Src Size>

## Crosspoint remote control 2 only

7.  Commands (K?) for requesting input/output channel names

        - Control command   =>  @[sp]K?<SorD><AorK>,<Ofset>
        - Command response  <=  K:<SorD><AorK><No.>,<Dat>

8.  Commands (A?) for requesting CPU status.

        - Control command   =>  @[sp]A?
        - Command response
            If CPU is active:   <=  @[sp]A:<ID>
            If CPU is passive:  <= (no response)

9.  Commands (W?) for requesting Destination Lock status.

        - Control command   =>  @[sp]W?<Lvl>,<Dest>
        - Command response  <=  W!<Lvl><Dest>,<ID>,0-2*
                                *0: Nothing locked
                                1: LOCK ALL
                                2: LOCK OTHER

10. Commands (K:) for importing signal names

        - Control command   =>  K:<SorD><SorLorA><No.>,<Dat>

11. Commands for setting video format (reference and/or switching point).

        - Control command
        Preset video format, reference and switching point. =>  @[sp]UF:<YY>/<R#>,<S$>
        - Command response  <=  UF!<YY>/<R#>,<S$>

        - Control command
        Set preset settings. =>  @[sp]UE:A
        - Command response  <=  UR!W
                            <=  UR!<YY>/<R#>,<S$>
                            <=  UR!E(Error response)

        - Control command
        Cancel preset settings. =>  @[sp]UE:C
        - Command response  <=  UR!C
